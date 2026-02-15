"""Workflow executor worker.

Executes individual workflow steps, called by Step Functions.
Supports long wait scheduling via EventBridge Scheduler.

Integrates with the node dispatcher for fault-tolerant execution when
the USE_NODE_DISPATCHER feature flag is enabled.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
import structlog

from complens.execution.node_dispatcher import dispatch_node, get_node_dispatcher
from complens.models.workflow_run import RunStatus, WorkflowRun
from complens.nodes.base import NodeContext, NodeResult
from complens.queue.feature_flags import FeatureFlag, is_flag_enabled
from complens.repositories.contact import ContactRepository
from complens.repositories.site import SiteRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.repositories.workspace import WorkspaceRepository
from complens.services.workflow_engine import WorkflowEngine
from complens.services.workflow_events import (
    emit_node_completed,
    emit_node_executing,
    emit_node_failed,
    emit_workflow_completed,
    emit_workflow_failed,
    emit_workflow_started,
)

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Execute workflow step from Step Functions.

    Args:
        event: Step Functions input.
        context: Lambda context.

    Returns:
        Step result for Step Functions.
    """
    action = event.get("action", "initialize")

    logger.info("Workflow executor invoked", action=action)

    try:
        if action == "initialize":
            return initialize_workflow(event)
        elif action == "execute_node":
            return execute_node(event)
        elif action == "resume_after_wait":
            return resume_after_wait(event)
        elif action == "schedule_resume":
            return schedule_long_wait_resume(event)
        elif action == "complete":
            return complete_workflow(event)
        else:
            raise ValueError(f"Unknown action: {action}")

    except Exception as e:
        logger.exception("Workflow executor error", error=str(e))
        return {
            "status": "error",
            "error": str(e),
        }


def initialize_workflow(event: dict) -> dict:
    """Initialize a new workflow run.

    Args:
        event: Event data with workflow_id, contact_id, trigger_data.

    Returns:
        Initialization result.
    """
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")
    contact_id = event.get("contact_id")
    trigger_type = event.get("trigger_type", "manual")
    trigger_data = event.get("trigger_data", {})

    # Get workflow
    workflow_repo = WorkflowRepository()
    workflow = workflow_repo.get_by_id(workspace_id, workflow_id)

    if not workflow:
        raise ValueError(f"Workflow {workflow_id} not found")

    # Get contact (may be None for form submissions that don't create contacts)
    contact = None
    contact_repo = ContactRepository()
    if contact_id:
        contact = contact_repo.get_by_id(workspace_id, contact_id)
        if not contact:
            logger.warning(
                "Contact not found for workflow execution",
                contact_id=contact_id,
                workspace_id=workspace_id,
            )

    # For form submissions without a contact, we can still run the workflow
    # using data from trigger_data (email, name, etc.)
    if not contact and trigger_type != "trigger_form_submitted":
        raise ValueError(f"Contact {contact_id} not found and trigger type requires a contact")

    # Create workflow run
    run_repo = WorkflowRunRepository()

    run = WorkflowRun(
        workflow_id=workflow_id,
        workspace_id=workspace_id,
        contact_id=contact_id,
        trigger_type=trigger_type,
        trigger_data=trigger_data,
        status=RunStatus.RUNNING,
    )
    run.start()

    # Store the run
    run = run_repo.create_run(run)

    # Get trigger node
    trigger_node = workflow.get_trigger_node()
    if not trigger_node:
        raise ValueError("Workflow has no trigger node")

    logger.info(
        "Workflow run initialized",
        run_id=run.id,
        workflow_id=workflow_id,
        contact_id=contact_id,
    )

    # Emit workflow started event
    emit_workflow_started(
        workspace_id=workspace_id,
        workflow_id=workflow_id,
        run_id=run.id,
        contact_id=contact_id,
        trigger_type=trigger_type,
    )

    return {
        "workflow_run_id": run.id,
        "current_node_id": trigger_node.id,
        "variables": {},
    }


def execute_node(event: dict) -> dict:
    """Execute a single workflow node.

    Args:
        event: Event data with run_id, node_id, variables.

    Returns:
        Node execution result.
    """
    workflow_run_id = event.get("workflow_run_id")
    current_node_id = event.get("current_node_id")
    variables = event.get("variables", {})

    # Get workflow run
    run_repo = WorkflowRunRepository()
    workflow_repo = WorkflowRepository()
    contact_repo = ContactRepository()
    workspace_repo = WorkspaceRepository()

    # Find the run
    # Note: We need to know the workflow_id to get the run
    # For Step Functions, we should pass workflow_id in the event
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")

    if not workflow_id:
        raise ValueError("workflow_id is required")

    run = run_repo.get_by_id(workflow_id, workflow_run_id)
    if not run:
        raise ValueError(f"Workflow run {workflow_run_id} not found")

    workflow = workflow_repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        raise ValueError(f"Workflow {workflow_id} not found")

    # Contact may be None for form submissions that don't create contacts
    contact = None
    if run.contact_id:
        contact = contact_repo.get_by_id(workspace_id, run.contact_id)

    # Load workspace for settings (notification_email, from_email, etc.)
    workspace = workspace_repo.get_by_id(workspace_id)
    workspace_settings = {}
    if workspace:
        # Merge explicit fields and settings dict for template access
        workspace_settings = {
            **workspace.settings,
            "notification_email": workspace.notification_email or "",
            "from_email": workspace.from_email or "",
            "name": workspace.name,
            "twilio_phone_number": workspace.twilio_phone_number or "",
        }

    # Load site settings if workflow is scoped to a site
    site_settings: dict = {}
    if workflow.site_id:
        site_repo = SiteRepository()
        site = site_repo.get_by_id(workspace_id, workflow.site_id)
        if site:
            site_settings = site.settings or {}

    # Get node definition
    node_def = workflow.get_node_by_id(current_node_id)
    if not node_def:
        raise ValueError(f"Node {current_node_id} not found")

    # Execute the node
    engine = WorkflowEngine()
    node_class = engine.get_node_class(node_def.node_type)

    if not node_class:
        raise ValueError(f"Unknown node type: {node_def.node_type}")

    node = node_class(node_id=current_node_id, config=node_def.get_config())

    context = NodeContext(
        contact=contact,
        workflow_run=run,
        workspace_id=workspace_id,
        workspace_settings=workspace_settings,
        site_settings=site_settings,
        variables=variables,
        trigger_data=run.trigger_data,
        node_config=node_def.get_config(),
    )

    # Emit node executing event
    node_label = node_def.data.get("label") if node_def.data else None
    emit_node_executing(
        workspace_id=workspace_id,
        workflow_id=workflow_id,
        run_id=workflow_run_id,
        node_id=current_node_id,
        node_type=node_def.node_type,
        node_label=node_label,
    )

    # Execute the node
    loop = asyncio.new_event_loop()
    try:
        # Check if node dispatcher is enabled for fault tolerance
        if is_flag_enabled(FeatureFlag.USE_NODE_DISPATCHER, workspace_id):
            # Use node dispatcher with circuit breaker and retry
            dispatch_result = loop.run_until_complete(
                dispatch_node(node, context)
            )
            result = dispatch_result.node_result

            # Log dispatcher metrics
            logger.info(
                "Node dispatched",
                node_id=current_node_id,
                category=dispatch_result.category.value,
                retry_attempts=dispatch_result.retry_attempts,
                execution_time_ms=dispatch_result.execution_time_ms,
                circuit_state=dispatch_result.circuit_state.value if dispatch_result.circuit_state else None,
            )
        else:
            # Direct execution (legacy path)
            result = loop.run_until_complete(node.execute(context))
    finally:
        loop.close()

    logger.info(
        "Node executed",
        node_id=current_node_id,
        node_type=node_def.node_type,
        success=result.success,
        status=result.status,
    )

    # Emit node completed/failed event
    if result.success:
        emit_node_completed(
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            run_id=workflow_run_id,
            node_id=current_node_id,
            node_type=node_def.node_type,
            result={"output": result.output, "variables": result.variables},
        )
    else:
        emit_node_failed(
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            run_id=workflow_run_id,
            node_id=current_node_id,
            node_type=node_def.node_type,
            error=result.error or "Unknown error",
        )

    # Determine next node
    next_node_id = result.next_node_id
    if not next_node_id and result.success:
        # Try to find from edges
        edges = workflow.get_outgoing_edges(current_node_id)
        if edges:
            next_node_id = edges[0].target

    # Merge variables
    merged_vars = {**variables, **result.variables, **result.output}

    return {
        "status": result.status,
        "success": result.success,
        "next_node_id": next_node_id,
        "variables": merged_vars,
        "wait_seconds": result.wait_seconds,
        "error": result.error,
    }


def resume_after_wait(event: dict) -> dict:
    """Resume workflow after a wait.

    Args:
        event: Event data.

    Returns:
        Resume result.
    """
    # This is essentially the same as execute_node
    # but called after Step Functions Wait state
    return execute_node(event)


def complete_workflow(event: dict) -> dict:
    """Complete a workflow run.

    Args:
        event: Event data with run_id, status, error.

    Returns:
        Completion result.
    """
    workflow_run_id = event.get("workflow_run_id")
    status = event.get("status", "completed")
    error = event.get("error")
    variables = event.get("variables", {})

    # Get workflow_id from event (passed through Step Functions)
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")

    if not workflow_id:
        logger.warning("workflow_id not in event, cannot update run status")
        return {"status": status}

    run_repo = WorkflowRunRepository()
    run = run_repo.get_by_id(workflow_id, workflow_run_id)

    if run:
        error_message = error.get("Error") if isinstance(error, dict) else str(error) if error else None
        run.complete(
            success=(status == "completed"),
            error_message=error_message,
        )
        run.variables = variables
        run_repo.update_run(run)

        logger.info(
            "Workflow run completed",
            run_id=workflow_run_id,
            status=status,
            success=(status == "completed"),
        )

        # Emit workflow completed/failed event
        if status == "completed":
            emit_workflow_completed(
                workspace_id=workspace_id,
                workflow_id=workflow_id,
                run_id=workflow_run_id,
                contact_id=run.contact_id,
                result={"variables": variables},
            )
        else:
            emit_workflow_failed(
                workspace_id=workspace_id,
                workflow_id=workflow_id,
                run_id=workflow_run_id,
                error=error_message or "Unknown error",
                contact_id=run.contact_id,
            )

    return {
        "status": status,
        "workflow_run_id": workflow_run_id,
    }


def schedule_long_wait_resume(event: dict) -> dict:
    """Schedule workflow resume for long waits using SQS delayed messages.

    For waits longer than 5 minutes, we exit the Step Functions execution
    and schedule a new execution to resume after the wait period. This
    frees up Step Functions resources and allows for fair multi-tenant
    scheduling when the workflow resumes.

    Args:
        event: Event data with wait details.

    Returns:
        Schedule result.
    """
    workflow_run_id = event.get("workflow_run_id")
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")
    contact_id = event.get("contact_id")
    next_node_id = event.get("next_node_id")
    wait_seconds = event.get("wait_seconds", 0)
    variables = event.get("variables", {})

    logger.info(
        "Scheduling long wait resume",
        workflow_run_id=workflow_run_id,
        workflow_id=workflow_id,
        wait_seconds=wait_seconds,
        next_node_id=next_node_id,
    )

    # Update workflow run status to waiting
    run_repo = WorkflowRunRepository()
    run = run_repo.get_by_id(workflow_id, workflow_run_id)
    if run:
        run.status = RunStatus.WAITING
        run.variables = variables
        run_repo.update_run(run)

    # For SQS, max delay is 15 minutes (900 seconds)
    # For longer waits, we'll use EventBridge Scheduler or chain delays
    queue_url = os.environ.get("WORKFLOW_QUEUE_URL")

    if queue_url and wait_seconds <= 900:
        # Use SQS delay for waits up to 15 minutes
        _schedule_via_sqs(
            queue_url=queue_url,
            workflow_run_id=workflow_run_id,
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            contact_id=contact_id,
            next_node_id=next_node_id,
            wait_seconds=wait_seconds,
            variables=variables,
        )
    else:
        # For longer waits, use EventBridge Scheduler
        _schedule_via_eventbridge(
            workflow_run_id=workflow_run_id,
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            contact_id=contact_id,
            next_node_id=next_node_id,
            wait_seconds=wait_seconds,
            variables=variables,
        )

    return {
        "status": "scheduled",
        "workflow_run_id": workflow_run_id,
        "scheduled_for_seconds": wait_seconds,
    }


def _schedule_via_sqs(
    queue_url: str,
    workflow_run_id: str,
    workflow_id: str,
    workspace_id: str,
    contact_id: str,
    next_node_id: str,
    wait_seconds: int,
    variables: dict,
) -> None:
    """Schedule workflow resume via SQS delayed message.

    Args:
        queue_url: SQS FIFO queue URL.
        workflow_run_id: Workflow run ID.
        workflow_id: Workflow ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        next_node_id: Next node to execute.
        wait_seconds: Seconds to wait.
        variables: Workflow variables.
    """
    sqs = boto3.client("sqs")

    message_body = json.dumps({
        "action": "resume_workflow",
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "next_node_id": next_node_id,
        "variables": variables,
    })

    # For FIFO queues, MessageGroupId ensures fair processing
    # MessageDeduplicationId prevents duplicate processing
    sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=message_body,
        DelaySeconds=min(wait_seconds, 900),
        MessageGroupId=workspace_id,
        MessageDeduplicationId=f"{workflow_run_id}-{next_node_id}-resume",
    )

    logger.info(
        "Scheduled resume via SQS",
        workflow_run_id=workflow_run_id,
        delay_seconds=wait_seconds,
    )


def _schedule_via_eventbridge(
    workflow_run_id: str,
    workflow_id: str,
    workspace_id: str,
    contact_id: str,
    next_node_id: str,
    wait_seconds: int,
    variables: dict,
) -> None:
    """Schedule workflow resume via EventBridge Scheduler.

    For waits longer than 15 minutes, use EventBridge Scheduler
    which can schedule up to 1 year in advance.

    Args:
        workflow_run_id: Workflow run ID.
        workflow_id: Workflow ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        next_node_id: Next node to execute.
        wait_seconds: Seconds to wait.
        variables: Workflow variables.
    """
    scheduler = boto3.client("scheduler")

    schedule_time = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)
    state_machine_arn = os.environ.get("WORKFLOW_STATE_MACHINE_ARN")
    schedule_role_arn = os.environ.get("SCHEDULER_ROLE_ARN")

    if not state_machine_arn or not schedule_role_arn:
        logger.error(
            "Missing configuration for EventBridge Scheduler",
            state_machine_arn=state_machine_arn,
            schedule_role_arn=schedule_role_arn,
        )
        # Fallback: Use SQS with max delay and let queue processor handle it
        queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
        if queue_url:
            _schedule_via_sqs(
                queue_url=queue_url,
                workflow_run_id=workflow_run_id,
                workflow_id=workflow_id,
                workspace_id=workspace_id,
                contact_id=contact_id,
                next_node_id=next_node_id,
                wait_seconds=900,  # Max SQS delay
                variables=variables,
            )
        return

    schedule_name = f"wf-resume-{workflow_run_id}-{next_node_id}"[:64]

    # Create one-time schedule to start Step Functions
    execution_input = json.dumps({
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "trigger_type": "scheduled_resume",
        "trigger_data": {
            "resumed_from_wait": True,
            "next_node_id": next_node_id,
            "variables": variables,
        },
    })

    try:
        scheduler.create_schedule(
            Name=schedule_name,
            ScheduleExpression=f"at({schedule_time.strftime('%Y-%m-%dT%H:%M:%S')})",
            FlexibleTimeWindow={"Mode": "OFF"},
            Target={
                "Arn": state_machine_arn,
                "RoleArn": schedule_role_arn,
                "Input": execution_input,
            },
            ActionAfterCompletion="DELETE",
        )

        logger.info(
            "Scheduled resume via EventBridge Scheduler",
            workflow_run_id=workflow_run_id,
            schedule_name=schedule_name,
            schedule_time=schedule_time.isoformat(),
        )
    except scheduler.exceptions.ConflictException:
        logger.warning(
            "Schedule already exists",
            schedule_name=schedule_name,
        )
