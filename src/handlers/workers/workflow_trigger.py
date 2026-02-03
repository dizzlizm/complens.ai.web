"""Workflow trigger worker.

Handles DynamoDB stream events and publishes workflow triggers.

Supports two routing modes based on feature flags:
1. EventBridge (legacy): Routes through EventBridge → FIFO queue
2. Direct routing (new): Routes directly to sharded queues via WorkflowRouter
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.queue.feature_flags import FeatureFlag, is_flag_enabled
from complens.queue.workflow_router import (
    WorkflowTriggerMessage,
    get_workflow_router,
)

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process DynamoDB stream events to trigger workflows.

    Events are published to EventBridge where rules route them to the
    appropriate SQS FIFO queue with MessageGroupId for fair multi-tenant
    processing.

    Args:
        event: DynamoDB stream event.
        context: Lambda context.

    Returns:
        Processing result.
    """
    records = event.get("Records", [])

    logger.info("Processing DynamoDB stream", record_count=len(records))

    events_to_publish = []

    for record in records:
        try:
            trigger_events = process_stream_record(record)
            events_to_publish.extend(trigger_events)
        except Exception as e:
            logger.exception("Failed to process stream record", error=str(e))

    # Batch publish events to EventBridge
    if events_to_publish:
        publish_to_eventbridge(events_to_publish)

    return {"statusCode": 200}


def process_stream_record(record: dict) -> list[dict]:
    """Process a single DynamoDB stream record.

    Args:
        record: Stream record.

    Returns:
        List of EventBridge events to publish.
    """
    event_name = record.get("eventName")
    new_image = record.get("dynamodb", {}).get("NewImage", {})
    old_image = record.get("dynamodb", {}).get("OldImage", {})

    if not new_image:
        return []

    # Deserialize DynamoDB image
    new_data = _deserialize_image(new_image)
    old_data = _deserialize_image(old_image) if old_image else {}

    pk = new_data.get("PK", "")
    sk = new_data.get("SK", "")

    events = []

    # Check for contact tag changes
    if pk.startswith("WS#") and sk.startswith("CONTACT#"):
        tag_events = _create_tag_events(event_name, new_data, old_data)
        events.extend(tag_events)

    return events


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


def _create_tag_events(event_name: str, new_data: dict, old_data: dict) -> list[dict]:
    """Create EventBridge events for tag changes.

    If sharded queues are enabled for the workspace, routes directly
    to the sharded queue instead of returning EventBridge events.

    Args:
        event_name: INSERT, MODIFY, REMOVE.
        new_data: New contact data.
        old_data: Old contact data.

    Returns:
        List of EventBridge events (empty if routed directly to sharded queue).
    """
    if event_name not in ("INSERT", "MODIFY"):
        return []

    new_tags = set(new_data.get("tags", []))
    old_tags = set(old_data.get("tags", []))

    added_tags = new_tags - old_tags
    removed_tags = old_tags - new_tags

    workspace_id = new_data.get("workspace_id")
    contact_id = new_data.get("id")

    if not workspace_id or not contact_id:
        return []

    # Check if we should route directly to sharded queues
    use_direct_routing = is_flag_enabled(FeatureFlag.USE_SHARDED_QUEUES, workspace_id)

    if use_direct_routing:
        # Route directly to sharded queue
        _route_tag_events_directly(
            workspace_id=workspace_id,
            contact_id=contact_id,
            added_tags=added_tags,
            removed_tags=removed_tags,
            old_tags=old_tags,
            new_tags=new_tags,
        )
        return []  # No EventBridge events needed

    # Fall back to EventBridge routing
    events = []

    # Create events for added tags
    for tag in added_tags:
        events.append({
            "Source": "complens.contact",
            "DetailType": "contact.tag.added",
            "Detail": json.dumps({
                "workspace_id": workspace_id,
                "contact_id": contact_id,
                "tag": tag,
                "operation": "added",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
                "trigger_type": "trigger_tag_added",
            }),
            "EventBusName": os.environ.get("EVENT_BUS_NAME"),
        })

        logger.info(
            "Creating tag added event",
            workspace_id=workspace_id,
            contact_id=contact_id,
            tag=tag,
        )

    # Create events for removed tags
    for tag in removed_tags:
        events.append({
            "Source": "complens.contact",
            "DetailType": "contact.tag.removed",
            "Detail": json.dumps({
                "workspace_id": workspace_id,
                "contact_id": contact_id,
                "tag": tag,
                "operation": "removed",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
                "trigger_type": "trigger_tag_added",
            }),
            "EventBusName": os.environ.get("EVENT_BUS_NAME"),
        })

        logger.info(
            "Creating tag removed event",
            workspace_id=workspace_id,
            contact_id=contact_id,
            tag=tag,
        )

    return events


def _route_tag_events_directly(
    workspace_id: str,
    contact_id: str,
    added_tags: set,
    removed_tags: set,
    old_tags: set,
    new_tags: set,
) -> None:
    """Route tag events directly to sharded queue.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        added_tags: Tags that were added.
        removed_tags: Tags that were removed.
        old_tags: Previous tag set.
        new_tags: Current tag set.
    """
    router = get_workflow_router()

    for tag in added_tags:
        message = WorkflowTriggerMessage(
            workspace_id=workspace_id,
            trigger_type="trigger_tag_added",
            trigger_data={
                "tag": tag,
                "operation": "added",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
            },
            contact_id=contact_id,
        )
        result = router.route_trigger(message)

        logger.info(
            "Routed tag added event directly",
            workspace_id=workspace_id,
            contact_id=contact_id,
            tag=tag,
            method=result.method,
            success=result.success,
        )

    for tag in removed_tags:
        message = WorkflowTriggerMessage(
            workspace_id=workspace_id,
            trigger_type="trigger_tag_added",  # Same trigger type handles both
            trigger_data={
                "tag": tag,
                "operation": "removed",
                "previous_tags": list(old_tags),
                "current_tags": list(new_tags),
            },
            contact_id=contact_id,
        )
        result = router.route_trigger(message)

        logger.info(
            "Routed tag removed event directly",
            workspace_id=workspace_id,
            contact_id=contact_id,
            tag=tag,
            method=result.method,
            success=result.success,
        )


def publish_to_eventbridge(events: list[dict]) -> None:
    """Publish events to EventBridge.

    Args:
        events: List of EventBridge events.
    """
    if not events:
        return

    eventbridge = boto3.client("events")

    # EventBridge allows max 10 events per batch
    batch_size = 10
    for i in range(0, len(events), batch_size):
        batch = events[i : i + batch_size]

        response = eventbridge.put_events(Entries=batch)

        failed_count = response.get("FailedEntryCount", 0)
        if failed_count > 0:
            logger.warning(
                "Some events failed to publish",
                failed_count=failed_count,
                entries=response.get("Entries", []),
            )

        logger.info(
            "Published events to EventBridge",
            batch_size=len(batch),
            failed_count=failed_count,
        )


def create_form_submitted_event(
    workspace_id: str,
    contact_id: str,
    form_id: str,
    form_name: str,
    submission_data: dict,
) -> dict:
    """Create an EventBridge event for form submission.

    This is a helper function for other handlers to use.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        form_id: Form ID.
        form_name: Form name.
        submission_data: Form submission data.

    Returns:
        EventBridge event dict.
    """
    return {
        "Source": "complens.form",
        "DetailType": "form.submitted",
        "Detail": json.dumps({
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "form_id": form_id,
            "form_name": form_name,
            "submission_data": submission_data,
            "trigger_type": "trigger_form_submitted",
        }),
        "EventBusName": os.environ.get("EVENT_BUS_NAME"),
    }


def create_inbound_message_event(
    workspace_id: str,
    contact_id: str,
    channel: str,
    message_body: str,
    message_metadata: dict,
) -> dict:
    """Create an EventBridge event for inbound message.

    This is a helper function for other handlers to use.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        channel: Channel (sms, email, etc.).
        message_body: Message body.
        message_metadata: Additional message metadata.

    Returns:
        EventBridge event dict.
    """
    return {
        "Source": "complens.messaging",
        "DetailType": f"{channel}.inbound",
        "Detail": json.dumps({
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "channel": channel,
            "message_body": message_body,
            "message_metadata": message_metadata,
            "trigger_type": f"trigger_{channel}_inbound",
        }),
        "EventBusName": os.environ.get("EVENT_BUS_NAME"),
    }


def trigger_form_submitted(
    workspace_id: str,
    contact_id: str | None,
    form_id: str,
    form_name: str,
    submission_data: dict,
) -> bool:
    """Trigger a form submitted workflow event.

    Automatically routes to sharded queue or EventBridge based on feature flags.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID (may be None if no contact created).
        form_id: Form ID.
        form_name: Form name.
        submission_data: Form submission data.

    Returns:
        True if trigger was routed successfully.
    """
    if is_flag_enabled(FeatureFlag.USE_SHARDED_QUEUES, workspace_id):
        # Route directly to sharded queue
        router = get_workflow_router()
        message = WorkflowTriggerMessage(
            workspace_id=workspace_id,
            trigger_type="trigger_form_submitted",
            trigger_data={
                "form_id": form_id,
                "form_name": form_name,
                "data": submission_data,
            },
            contact_id=contact_id,
        )
        result = router.route_trigger(message)

        logger.info(
            "Form submitted trigger routed",
            workspace_id=workspace_id,
            form_id=form_id,
            method=result.method,
            success=result.success,
        )
        return result.success

    # Fall back to EventBridge
    event = create_form_submitted_event(
        workspace_id=workspace_id,
        contact_id=contact_id or "",
        form_id=form_id,
        form_name=form_name,
        submission_data=submission_data,
    )
    publish_to_eventbridge([event])
    return True


def trigger_inbound_message(
    workspace_id: str,
    contact_id: str,
    channel: str,
    message_body: str,
    message_metadata: dict,
) -> bool:
    """Trigger an inbound message workflow event.

    Automatically routes to sharded queue or EventBridge based on feature flags.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        channel: Channel (sms, email, etc.).
        message_body: Message body.
        message_metadata: Additional message metadata.

    Returns:
        True if trigger was routed successfully.
    """
    if is_flag_enabled(FeatureFlag.USE_SHARDED_QUEUES, workspace_id):
        # Route directly to sharded queue
        router = get_workflow_router()
        message = WorkflowTriggerMessage(
            workspace_id=workspace_id,
            trigger_type=f"trigger_{channel}_inbound",
            trigger_data={
                "channel": channel,
                "message_body": message_body,
                **message_metadata,
            },
            contact_id=contact_id,
        )
        result = router.route_trigger(message)

        logger.info(
            "Inbound message trigger routed",
            workspace_id=workspace_id,
            channel=channel,
            method=result.method,
            success=result.success,
        )
        return result.success

    # Fall back to EventBridge
    event = create_inbound_message_event(
        workspace_id=workspace_id,
        contact_id=contact_id,
        channel=channel,
        message_body=message_body,
        message_metadata=message_metadata,
    )
    publish_to_eventbridge([event])
    return True
