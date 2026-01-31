"""Messages API handler."""

import json
import os
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.message import CreateMessageRequest, Message, MessageDirection, MessageSender
from complens.utils.auth import get_auth_context
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle messages API requests.

    Routes:
        GET    /conversations/{conversation_id}/messages
        POST   /conversations/{conversation_id}/messages
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        conversation_id = path_params.get("conversation_id")

        if not conversation_id:
            return error("conversation_id is required", 400)

        # Get auth context
        auth = get_auth_context(event)

        if http_method == "GET":
            return list_messages(conversation_id, event)
        elif http_method == "POST":
            return create_message(conversation_id, auth, event)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Messages handler error", error=str(e))
        return error("Internal server error", 500)


def list_messages(conversation_id: str, event: dict) -> dict:
    """List messages in a conversation."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)

    # Query messages from DynamoDB
    import boto3

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("TABLE_NAME", "complens-dev"))

    response = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
        ExpressionAttributeValues={
            ":pk": f"CONV#{conversation_id}",
            ":sk_prefix": "MSG#",
        },
        Limit=limit,
        ScanIndexForward=False,  # Newest first
    )

    messages = [Message.from_dynamodb(item) for item in response.get("Items", [])]

    return success({
        "items": [m.model_dump(mode="json") for m in messages],
        "pagination": {"limit": limit},
    })


def create_message(conversation_id: str, auth, event: dict) -> dict:
    """Create a new message in a conversation."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateMessageRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Get conversation to get workspace_id and contact_id
    import boto3

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("TABLE_NAME", "complens-dev"))

    # We need to find the conversation - this is a simplified approach
    # In production, you'd use a GSI or cache
    # For now, we'll assume workspace_id and contact_id are provided in the body

    workspace_id = body.get("workspace_id")
    contact_id = body.get("contact_id")

    if not workspace_id or not contact_id:
        return error("workspace_id and contact_id are required", 400)

    # Create message
    message = Message(
        conversation_id=conversation_id,
        workspace_id=workspace_id,
        contact_id=contact_id,
        content=request.content,
        content_type=request.content_type,
        direction=request.direction,
        channel=request.channel,
        sender_type=request.sender_type,
        sender_id=auth.user_id if request.sender_type == MessageSender.USER else None,
        email_subject=request.email_subject,
        email_to=request.email_to,
        email_cc=request.email_cc,
        attachments=request.attachments,
    )

    # Save to DynamoDB
    db_item = message.to_dynamodb()
    db_item["PK"] = message.get_pk()
    db_item["SK"] = message.get_sk()

    table.put_item(Item=db_item)

    logger.info(
        "Message created",
        message_id=message.id,
        conversation_id=conversation_id,
        direction=message.direction.value,
    )

    # If outbound message, queue for sending
    if request.direction == MessageDirection.OUTBOUND:
        # Queue message for delivery
        _queue_message_delivery(message)

    # If inbound message and AI is enabled, queue for AI processing
    if request.direction == MessageDirection.INBOUND:
        _queue_ai_processing(message)

    return created(message.model_dump(mode="json"))


def _queue_message_delivery(message: Message) -> None:
    """Queue a message for delivery via the appropriate channel."""
    # TODO: Implement message delivery queue
    pass


def _queue_ai_processing(message: Message) -> None:
    """Queue an inbound message for AI processing."""
    queue_url = os.environ.get("AI_QUEUE_URL")
    if not queue_url:
        return

    sqs = boto3.client("sqs")

    sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({
            "type": "inbound_message",
            "message_id": message.id,
            "conversation_id": message.conversation_id,
            "workspace_id": message.workspace_id,
            "contact_id": message.contact_id,
            "content": message.content,
            "channel": message.channel.value,
        }),
    )

    logger.info("Message queued for AI processing", message_id=message.id)
