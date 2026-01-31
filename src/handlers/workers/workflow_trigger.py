"""Workflow trigger worker.

Handles DynamoDB stream events to trigger workflows.
"""

import json
import os
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process DynamoDB stream events to trigger workflows.

    Args:
        event: DynamoDB stream event.
        context: Lambda context.

    Returns:
        Processing result.
    """
    records = event.get("Records", [])

    logger.info("Processing DynamoDB stream", record_count=len(records))

    for record in records:
        try:
            process_stream_record(record)
        except Exception as e:
            logger.exception("Failed to process stream record", error=str(e))

    return {"statusCode": 200}


def process_stream_record(record: dict) -> None:
    """Process a single DynamoDB stream record.

    Args:
        record: Stream record.
    """
    event_name = record.get("eventName")
    new_image = record.get("dynamodb", {}).get("NewImage", {})
    old_image = record.get("dynamodb", {}).get("OldImage", {})

    if not new_image:
        return

    # Deserialize DynamoDB image
    new_data = _deserialize_image(new_image)
    old_data = _deserialize_image(old_image) if old_image else {}

    pk = new_data.get("PK", "")
    sk = new_data.get("SK", "")

    # Check for contact tag changes
    if pk.startswith("WS#") and sk.startswith("CONTACT#"):
        _check_tag_triggers(event_name, new_data, old_data)

    # Check for form submissions (would need a form submission entity)
    # Check for appointment bookings (would need an appointment entity)


def _deserialize_image(image: dict) -> dict:
    """Deserialize DynamoDB image to regular dict.

    Args:
        image: DynamoDB attribute value format.

    Returns:
        Regular Python dict.
    """
    from boto3.dynamodb.types import TypeDeserializer

    deserializer = TypeDeserializer()
    return {k: deserializer.deserialize(v) for k, v in image.items()}


def _check_tag_triggers(event_name: str, new_data: dict, old_data: dict) -> None:
    """Check for tag-based workflow triggers.

    Args:
        event_name: INSERT, MODIFY, REMOVE.
        new_data: New contact data.
        old_data: Old contact data.
    """
    if event_name not in ("INSERT", "MODIFY"):
        return

    new_tags = set(new_data.get("tags", []))
    old_tags = set(old_data.get("tags", []))

    added_tags = new_tags - old_tags
    removed_tags = old_tags - new_tags

    workspace_id = new_data.get("workspace_id")
    contact_id = new_data.get("id")

    if not workspace_id or not contact_id:
        return

    # Trigger workflows for added tags
    for tag in added_tags:
        _trigger_workflow(
            workspace_id=workspace_id,
            contact_id=contact_id,
            trigger_type="trigger_tag_added",
            trigger_data={
                "tag": tag,
                "operation": "added",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
            },
        )

    # Trigger workflows for removed tags
    for tag in removed_tags:
        _trigger_workflow(
            workspace_id=workspace_id,
            contact_id=contact_id,
            trigger_type="trigger_tag_added",  # Same trigger, different operation
            trigger_data={
                "tag": tag,
                "operation": "removed",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
            },
        )


def _trigger_workflow(
    workspace_id: str,
    contact_id: str,
    trigger_type: str,
    trigger_data: dict,
) -> None:
    """Find and trigger matching workflows.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        trigger_type: Type of trigger.
        trigger_data: Trigger event data.
    """
    from complens.repositories.workflow import WorkflowRepository

    repo = WorkflowRepository()

    # Get active workflows for workspace
    workflows = repo.list_active(workspace_id)

    for workflow in workflows:
        # Check if workflow has matching trigger
        trigger_node = workflow.get_trigger_node()
        if not trigger_node or trigger_node.node_type != trigger_type:
            continue

        # Check trigger configuration matches
        config = trigger_node.get_config()

        if trigger_type == "trigger_tag_added":
            # Check if tag matches
            configured_tag = config.get("tag_name")
            configured_operation = config.get("tag_operation", "added")

            if configured_tag and configured_tag != trigger_data.get("tag"):
                continue
            if configured_operation != "any" and configured_operation != trigger_data.get(
                "operation"
            ):
                continue

        # Trigger matches - start workflow
        logger.info(
            "Triggering workflow",
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            trigger_type=trigger_type,
            contact_id=contact_id,
        )

        _start_workflow_execution(
            workflow_id=workflow.id,
            workspace_id=workspace_id,
            contact_id=contact_id,
            trigger_type=trigger_type,
            trigger_data=trigger_data,
        )


def _start_workflow_execution(
    workflow_id: str,
    workspace_id: str,
    contact_id: str,
    trigger_type: str,
    trigger_data: dict,
) -> None:
    """Start workflow execution via Step Functions.

    Args:
        workflow_id: Workflow ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        trigger_type: Trigger type.
        trigger_data: Trigger data.
    """
    state_machine_arn = os.environ.get("WORKFLOW_STATE_MACHINE_ARN")

    if state_machine_arn:
        sfn = boto3.client("stepfunctions")

        execution_input = {
            "workflow_id": workflow_id,
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "trigger_type": trigger_type,
            "trigger_data": trigger_data,
        }

        sfn.start_execution(
            stateMachineArn=state_machine_arn,
            input=json.dumps(execution_input),
        )

        logger.info(
            "Step Functions execution started",
            workflow_id=workflow_id,
            contact_id=contact_id,
        )
    else:
        # Queue for later processing
        queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
        if queue_url:
            sqs = boto3.client("sqs")
            sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps({
                    "workflow_id": workflow_id,
                    "workspace_id": workspace_id,
                    "contact_id": contact_id,
                    "trigger_type": trigger_type,
                    "trigger_data": trigger_data,
                }),
            )
