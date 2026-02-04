"""Sharded queue processor for scalable workflow execution.

Processes workflow trigger events from sharded standard SQS queues.
Integrates with the fair scheduler to ensure multi-tenant fairness
and prevents any single workspace from monopolizing processing.

This replaces the FIFO queue processor for workspaces that have been
migrated to the new sharded queue architecture.
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.models.base import generate_ulid
from complens.queue.fair_scheduler import FairScheduler, TenantTier, get_fair_scheduler
from complens.queue.feature_flags import FeatureFlag, is_flag_enabled
from complens.repositories.workflow import WorkflowRepository
from complens.repositories.workspace import WorkspaceRepository

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process workflow trigger events from sharded SQS queues.

    Supports partial batch failure reporting and integrates with
    the fair scheduler for multi-tenant fairness.

    Args:
        event: SQS event with records.
        context: Lambda context.

    Returns:
        Batch item failures for partial retry.
    """
    records = event.get("Records", [])
    batch_item_failures = []

    # Get the shard index from the event source ARN
    shard_index = _extract_shard_index(event)

    logger.info(
        "Processing sharded queue",
        record_count=len(records),
        shard_index=shard_index,
    )

    # Initialize scheduler
    scheduler = get_fair_scheduler()

    for record in records:
        try:
            result = process_queue_record(record, scheduler, shard_index)
            if not result:
                # Message was throttled - report as failure to return to queue
                batch_item_failures.append({
                    "itemIdentifier": record.get("messageId"),
                })
        except Exception as e:
            logger.exception(
                "Failed to process queue record",
                message_id=record.get("messageId"),
                error=str(e),
            )
            batch_item_failures.append({
                "itemIdentifier": record.get("messageId"),
            })

    return {
        "batchItemFailures": batch_item_failures,
    }


def _extract_shard_index(event: dict) -> int:
    """Extract shard index from event source ARN.

    Args:
        event: SQS event.

    Returns:
        Shard index or -1 if not determinable.
    """
    records = event.get("Records", [])
    if not records:
        return -1

    # Get the event source ARN from first record
    source_arn = records[0].get("eventSourceARN", "")

    # Expected format: arn:aws:sqs:region:account:queue-name-shard-N
    # Try to extract shard number from queue name
    if "-shard-" in source_arn.lower():
        try:
            shard_part = source_arn.lower().split("-shard-")[-1]
            # Handle any trailing parts (e.g., .fifo)
            shard_num = "".join(filter(str.isdigit, shard_part.split("-")[0]))
            return int(shard_num) if shard_num else -1
        except (ValueError, IndexError):
            pass

    return -1


def process_queue_record(
    record: dict,
    scheduler: FairScheduler,
    shard_index: int,
) -> bool:
    """Process a single SQS record with fair scheduling.

    Args:
        record: SQS record.
        scheduler: Fair scheduler instance.
        shard_index: Current shard index.

    Returns:
        True if processed successfully, False if throttled.
    """
    message_id = record.get("messageId")
    body = record.get("body", "{}")

    # Get message attributes
    message_attrs = record.get("messageAttributes", {})
    workspace_id = _get_message_attr(message_attrs, "workspace_id")
    priority = _get_message_attr(message_attrs, "priority", "normal")

    # Parse the message body
    try:
        event_data = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in queue message", message_id=message_id)
        return True  # Don't retry invalid JSON

    # Get workspace ID from body if not in attributes
    if not workspace_id:
        workspace_id = event_data.get("workspace_id")

    if not workspace_id:
        logger.warning(
            "Missing workspace_id in message",
            message_id=message_id,
        )
        return True  # Don't retry messages without workspace

    # Check if fair scheduling is enabled
    if is_flag_enabled(FeatureFlag.USE_FAIR_SCHEDULER, workspace_id):
        # Get tenant tier from workspace settings
        tier = _get_workspace_tier(workspace_id)

        # Check if we should process this message
        decision = scheduler.should_process(
            workspace_id=workspace_id,
            priority=priority,
            tier=tier,
        )

        if not decision.allowed:
            logger.info(
                "Message throttled by fair scheduler",
                workspace_id=workspace_id,
                reason=decision.reason,
                wait_seconds=decision.wait_seconds,
            )
            return False  # Return to queue for retry

    # Process the message
    logger.info(
        "Processing workflow trigger",
        workspace_id=workspace_id,
        message_id=message_id,
        priority=priority,
        shard_index=shard_index,
    )

    # Check if this is a resume action
    if event_data.get("action") == "resume_workflow":
        handle_workflow_resume(event_data)
    else:
        # Process trigger event
        trigger_type = event_data.get("trigger_type")
        contact_id = event_data.get("contact_id")
        trigger_data = event_data

        if trigger_type:
            find_and_trigger_workflows(
                workspace_id=workspace_id,
                contact_id=contact_id,
                trigger_type=trigger_type,
                trigger_data=trigger_data,
            )

    # Consume credit after successful processing
    if is_flag_enabled(FeatureFlag.USE_FAIR_SCHEDULER, workspace_id):
        scheduler.consume_credit(workspace_id, priority)

    return True


def _get_message_attr(attrs: dict, key: str, default: str = "") -> str:
    """Get a string value from SQS message attributes.

    Args:
        attrs: Message attributes dict.
        key: Attribute key.
        default: Default value.

    Returns:
        Attribute value or default.
    """
    attr = attrs.get(key, {})
    if isinstance(attr, dict):
        return attr.get("stringValue", attr.get("StringValue", default))
    return default


def _get_workspace_tier(workspace_id: str) -> TenantTier:
    """Get the subscription tier for a workspace.

    Args:
        workspace_id: Workspace identifier.

    Returns:
        TenantTier enum value.
    """
    try:
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(workspace_id)

        if workspace:
            tier_str = workspace.settings.get("subscription_tier", "free")
            try:
                return TenantTier(tier_str)
            except ValueError:
                pass

    except Exception as e:
        logger.warning(
            "Failed to get workspace tier",
            workspace_id=workspace_id,
            error=str(e),
        )

    return TenantTier.FREE


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

    execution_input = {
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "trigger_type": "scheduled_resume",
        "trigger_data": {},
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
        contact_id: Contact ID (may be None for form submissions).
        trigger_type: Type of trigger.
        trigger_data: Trigger event data.
    """
    repo = WorkflowRepository()
    workflows = repo.list_active(workspace_id)

    triggered_count = 0

    for workflow in workflows:
        trigger_node = workflow.get_trigger_node()
        if not trigger_node or trigger_node.node_type != trigger_type:
            continue

        if not _matches_trigger_config(trigger_node, trigger_type, trigger_data):
            continue

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
        configured_tag = config.get("tag_name")
        configured_operation = config.get("tag_operation", "added")

        if configured_tag and configured_tag != trigger_data.get("tag"):
            return False
        if configured_operation != "any" and configured_operation != trigger_data.get("operation"):
            return False

    elif trigger_type == "trigger_form_submitted":
        configured_form_id = config.get("form_id")
        if configured_form_id and configured_form_id != trigger_data.get("form_id"):
            return False

    elif trigger_type in ("trigger_sms_inbound", "trigger_email_inbound"):
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
        contact_id: Contact ID (may be None).
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

    workflow_run_id = f"run-{generate_ulid()}"

    execution_input = {
        "workflow_run_id": workflow_run_id,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "trigger_type": trigger_type,
        "trigger_data": trigger_data,
    }

    execution_name = f"{workflow_id}-{contact_id or 'none'}-{workflow_run_id}"[:80]

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
