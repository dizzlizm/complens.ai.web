"""Workflow trigger worker.

Handles DynamoDB stream events and publishes workflow triggers to EventBridge.
"""

import json
import os
from typing import Any

import boto3
import structlog

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

    Args:
        event_name: INSERT, MODIFY, REMOVE.
        new_data: New contact data.
        old_data: Old contact data.

    Returns:
        List of EventBridge events.
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
