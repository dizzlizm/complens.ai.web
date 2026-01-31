"""Workflow executor worker.

Executes individual workflow steps, called by Step Functions.
Supports long wait scheduling via EventBridge Scheduler.
"""

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
import structlog

from complens.models.workflow_run import RunStatus, WorkflowRun
from complens.repositories.contact import ContactRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.services.workflow_engine import WorkflowEngine

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

    # Get contact
    contact_repo = ContactRepository()
    contact = contact_repo.get_by_id(workspace_id, contact_id)

    if not contact:
        raise ValueError(f"Contact {contact_id} not found")

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

    contact = contact_repo.get_by_id(workspace_id, run.contact_id)
    if not contact:
        raise ValueError(f"Contact {run.contact_id} not found")

    # Get node definition
    node_def = workflow.get_node_by_id(current_node_id)
    if not node_def:
        raise ValueError(f"Node {current_node_id} not found")

    # Execute the node
    engine = WorkflowEngine()
    node_class = engine.get_node_class(node_def.node_type)

    if not node_class:
        raise ValueError(f"Unknown node type: {node_def.node_type}")

    from complens.nodes.base import NodeContext

    node = node_class(node_id=current_node_id, config=node_def.get_config())

    context = NodeContext(
        contact=contact,
        workflow_run=run,
        workspace_id=workspace_id,
        variables=variables,
        trigger_data=run.trigger_data,
        node_config=node_def.get_config(),
    )

    # Run async execution
    loop = asyncio.new_event_loop()
    try:
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
        run.complete(
            success=(status == "completed"),
            error_message=error.get("Error") if isinstance(error, dict) else str(error) if error else None,
        )
        run.variables = variables
        run_repo.update_run(run)

        logger.info(
            "Workflow run completed",
            run_id=workflow_run_id,
            status=status,
            success=(status == "completed"),
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
