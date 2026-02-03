"""Workflow queue processor.

Processes workflow trigger events from the FIFO queue.
The FIFO queue uses MessageGroupId=workspace_id to ensure fair
multi-tenant processing - no single workspace can monopolize the queue.
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.models.base import generate_ulid
from complens.repositories.workflow import WorkflowRepository

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process workflow trigger events from SQS FIFO queue.

    Supports partial batch failure reporting to allow successful messages
    to be deleted while failed messages are retried.

    Args:
        event: SQS event with records.
        context: Lambda context.

    Returns:
        Batch item failures for partial retry.
    """
    records = event.get("Records", [])
    batch_item_failures = []

    logger.info("Processing workflow queue", record_count=len(records))

    for record in records:
        try:
            process_queue_record(record)
        except Exception as e:
            logger.exception(
                "Failed to process queue record",
                message_id=record.get("messageId"),
                error=str(e),
            )
            # Report this item as failed for retry
            batch_item_failures.append({
                "itemIdentifier": record.get("messageId"),
            })

    return {
        "batchItemFailures": batch_item_failures,
    }


def process_queue_record(record: dict) -> None:
    """Process a single SQS record.

    The record body contains either:
    - An EventBridge event detail (for new triggers)
    - A resume_workflow action (for scheduled resumes)

    Args:
        record: SQS record.
    """
    message_id = record.get("messageId")
    body = record.get("body", "{}")

    # Parse the EventBridge event (SQS wraps it)
    try:
        event_data = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in queue message", message_id=message_id)
        return

    # Check if this is a resume action from a scheduled wait
    if event_data.get("action") == "resume_workflow":
        handle_workflow_resume(event_data)
        return

    # EventBridge puts the actual event detail in "detail"
    # But if sent directly from SQS, it might be the raw detail
    if "detail" in event_data:
        detail = event_data["detail"]
        if isinstance(detail, str):
            detail = json.loads(detail)
    else:
        detail = event_data

    workspace_id = detail.get("workspace_id")
    contact_id = detail.get("contact_id")
    trigger_type = detail.get("trigger_type")
    trigger_data = detail

    # workspace_id and trigger_type are always required
    if not workspace_id or not trigger_type:
        logger.warning(
            "Missing required fields in queue message",
            message_id=message_id,
            workspace_id=workspace_id,
            trigger_type=trigger_type,
        )
        return

    # contact_id is optional for form submission triggers (form may not create contacts)
    # but required for other trigger types like chat, tag_added, etc.
    if not contact_id and trigger_type not in ("trigger_form_submitted", "trigger_webhook"):
        logger.warning(
            "Missing contact_id for trigger that requires it",
            message_id=message_id,
            workspace_id=workspace_id,
            trigger_type=trigger_type,
        )
        return

    logger.info(
        "Processing workflow trigger",
        workspace_id=workspace_id,
        contact_id=contact_id,
        trigger_type=trigger_type,
    )

    # Find matching workflows
    find_and_trigger_workflows(
        workspace_id=workspace_id,
        contact_id=contact_id,
        trigger_type=trigger_type,
        trigger_data=trigger_data,
    )


def handle_workflow_resume(event_data: dict) -> None:
    """Handle a workflow resume from a scheduled wait.

    Args:
        event_data: Resume event data.
    """
    workflow_run_id = event_data.get("workflow_run_id")
    workflow_id = event_data.get("workflow_id")
    workspace_id = event_data.get("workspace_id")
    contact_id = event_data.get("contact_id")
    next_node_id = event_data.get("next_node_id")
    variables = event_data.get("variables", {})

    logger.info(
        "Resuming workflow from scheduled wait",
        workflow_run_id=workflow_run_id,
        workflow_id=workflow_id,
        next_node_id=next_node_id,
    )

    # Start a new Step Functions execution to continue the workflow
    state_machine_arn = os.environ.get("WORKFLOW_STATE_MACHINE_ARN")

    if not state_machine_arn:
        logger.error("WORKFLOW_STATE_MACHINE_ARN not configured")
        return

    sfn = boto3.client("stepfunctions")

    # The execution input includes the current state
    execution_input = {
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "trigger_type": "scheduled_resume",
        "trigger_data": {},
        # Pre-populate execution context to skip initialization
        "execution_context": {
            "current_node_id": next_node_id,
            "variables": variables,
        },
    }

    execution_name = f"{workflow_id}-{workflow_run_id}-resume-{next_node_id}"[:80]

    try:
        response = sfn.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(execution_input),
        )

        logger.info(
            "Workflow resume execution started",
            execution_arn=response["executionArn"],
            workflow_run_id=workflow_run_id,
        )
    except sfn.exceptions.ExecutionAlreadyExists:
        logger.warning(
            "Resume execution already exists",
            workflow_run_id=workflow_run_id,
            next_node_id=next_node_id,
        )


def find_and_trigger_workflows(
    workspace_id: str,
    contact_id: str | None,
    trigger_type: str,
    trigger_data: dict,
) -> None:
    """Find matching workflows and start executions.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID (may be None for form submissions without contacts).
        trigger_type: Type of trigger.
        trigger_data: Trigger event data.
    """
    repo = WorkflowRepository()

    # Get active workflows for workspace
    workflows = repo.list_active(workspace_id)

    triggered_count = 0

    for workflow in workflows:
        # Check if workflow has matching trigger
        trigger_node = workflow.get_trigger_node()
        if not trigger_node or trigger_node.node_type != trigger_type:
            continue

        # Check trigger configuration matches
        if not _matches_trigger_config(trigger_node, trigger_type, trigger_data):
            continue

        # Trigger matches - start workflow
        logger.info(
            "Triggering workflow",
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            trigger_type=trigger_type,
            contact_id=contact_id,
        )

        start_workflow_execution(
            workflow_id=workflow.id,
            workspace_id=workspace_id,
            contact_id=contact_id,
            trigger_type=trigger_type,
            trigger_data=trigger_data,
        )
        triggered_count += 1

    logger.info(
        "Workflow trigger processing complete",
        workspace_id=workspace_id,
        trigger_type=trigger_type,
        triggered_count=triggered_count,
    )


def _matches_trigger_config(
    trigger_node: Any,
    trigger_type: str,
    trigger_data: dict,
) -> bool:
    """Check if trigger data matches the trigger node configuration.

    Args:
        trigger_node: The workflow trigger node.
        trigger_type: Type of trigger.
        trigger_data: Trigger event data.

    Returns:
        True if the trigger matches.
    """
    config = trigger_node.get_config()

    if trigger_type == "trigger_tag_added":
        # Check if tag matches
        configured_tag = config.get("tag_name")
        configured_operation = config.get("tag_operation", "added")

        if configured_tag and configured_tag != trigger_data.get("tag"):
            return False
        if configured_operation != "any" and configured_operation != trigger_data.get("operation"):
            return False

    elif trigger_type == "trigger_form_submitted":
        # Check if form matches
        configured_form_id = config.get("form_id")
        if configured_form_id and configured_form_id != trigger_data.get("form_id"):
            return False

    elif trigger_type in ("trigger_sms_inbound", "trigger_email_inbound"):
        # Check channel-specific config if any
        configured_keywords = config.get("keywords", [])
        if configured_keywords:
            message_body = trigger_data.get("message_body", "").lower()
            if not any(kw.lower() in message_body for kw in configured_keywords):
                return False

    return True


def start_workflow_execution(
    workflow_id: str,
    workspace_id: str,
    contact_id: str | None,
    trigger_type: str,
    trigger_data: dict,
) -> str | None:
    """Start workflow execution via Step Functions.

    Args:
        workflow_id: Workflow ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID (may be None for form submissions without contacts).
        trigger_type: Trigger type.
        trigger_data: Trigger data.

    Returns:
        Execution ARN if started, None otherwise.
    """
    state_machine_arn = os.environ.get("WORKFLOW_STATE_MACHINE_ARN")

    if not state_machine_arn:
        logger.warning("WORKFLOW_STATE_MACHINE_ARN not configured")
        return None

    sfn = boto3.client("stepfunctions")

    # Generate a unique run ID
    workflow_run_id = f"run-{generate_ulid()}"

    execution_input = {
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "trigger_type": trigger_type,
        "trigger_data": trigger_data,
    }

    # Use a unique name to prevent duplicate executions
    # Include contact_id to allow same workflow to run for different contacts
    execution_name = f"{workflow_id}-{contact_id}-{workflow_run_id}"[:80]

    try:
        response = sfn.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(execution_input),
        )

        logger.info(
            "Step Functions execution started",
            execution_arn=response["executionArn"],
            workflow_id=workflow_id,
            workflow_run_id=workflow_run_id,
            contact_id=contact_id,
        )

        return response["executionArn"]

    except sfn.exceptions.ExecutionAlreadyExists:
        logger.warning(
            "Execution already exists, skipping duplicate",
            workflow_id=workflow_id,
            contact_id=contact_id,
        )
        return None
