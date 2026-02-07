"""Messages API handler."""

import json
import os
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.message import CreateMessageRequest, Message, MessageDirection, MessageSender
from complens.utils.auth import get_auth_context
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
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
    """Create a new message in a conversation.

    SECURITY: This endpoint verifies workspace access by looking up the conversation
    first and validating access to the conversation's workspace.
    """
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

    # SECURITY: Get workspace_id and contact_id from the conversation, not from request body
    # This prevents attackers from creating messages in unauthorized workspaces
    from complens.repositories.conversation import ConversationRepository
    from complens.utils.auth import require_workspace_access

    conv_repo = ConversationRepository()

    # Look up the conversation to get its workspace_id
    # First try with workspace_id from body if provided (faster lookup)
    body_workspace_id = body.get("workspace_id")
    if body_workspace_id:
        conversation = conv_repo.get_by_id(body_workspace_id, conversation_id)
    else:
        # Fall back to scan-based lookup
        conversation = conv_repo.get_by_id(conversation_id)

    if not conversation:
        return not_found("Conversation", conversation_id)

    # SECURITY: Verify the authenticated user has access to this workspace
    try:
        require_workspace_access(auth, conversation.workspace_id)
    except (ForbiddenError, ValueError):
        logger.warning(
            "Message creation denied - workspace access",
            conversation_id=conversation_id,
            workspace_id=conversation.workspace_id,
            user_id=auth.user_id if auth else None,
        )
        return error("Access denied", 403)

    # Use verified workspace_id and contact_id from the conversation
    workspace_id = conversation.workspace_id
    contact_id = conversation.contact_id

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("TABLE_NAME", "complens-dev"))

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
    """Queue a message for delivery via the appropriate channel.

    Routes the message to the appropriate delivery service based on channel:
    - email: Sends via Amazon SES
    - sms: Sends via Twilio
    - Other channels: Logs a warning (not yet supported)
    """
    from complens.models.message import MessageChannel

    channel = message.channel

    if channel == MessageChannel.EMAIL:
        _deliver_email(message)
    elif channel == MessageChannel.SMS:
        _deliver_sms(message)
    else:
        logger.warning(
            "Delivery not supported for channel",
            channel=channel.value if hasattr(channel, 'value') else channel,
            message_id=message.id,
        )


def _deliver_email(message: Message) -> None:
    """Deliver a message via email (SES)."""
    from complens.services.email_service import EmailError, EmailService

    if not message.email_to:
        logger.warning("No email_to on outbound email message", message_id=message.id)
        return

    try:
        email_service = EmailService()
        result = email_service.send_email(
            to=message.email_to,
            subject=message.email_subject or "New message",
            body_text=message.content,
            cc=message.email_cc,
            tags={"message_id": message.id, "workspace_id": message.workspace_id},
        )
        logger.info(
            "Email delivered",
            message_id=message.id,
            ses_message_id=result.get("message_id"),
        )
    except EmailError as e:
        logger.error("Email delivery failed", message_id=message.id, error=str(e))


def _deliver_sms(message: Message) -> None:
    """Deliver a message via SMS (Twilio)."""
    from complens.repositories.contact import ContactRepository
    from complens.services.twilio_service import TwilioError, TwilioService

    contact_repo = ContactRepository()
    contact = contact_repo.get_by_id(message.workspace_id, message.contact_id)

    if not contact or not contact.phone:
        logger.warning(
            "No phone number for SMS delivery",
            message_id=message.id,
            contact_id=message.contact_id,
        )
        return

    try:
        twilio = TwilioService()
        if not twilio.is_configured:
            logger.warning("Twilio not configured, skipping SMS delivery", message_id=message.id)
            return

        result = twilio.send_sms(to=contact.phone, body=message.content)
        logger.info(
            "SMS delivered",
            message_id=message.id,
            twilio_sid=result.get("message_sid"),
        )
    except TwilioError as e:
        logger.error("SMS delivery failed", message_id=message.id, error=str(e))


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
