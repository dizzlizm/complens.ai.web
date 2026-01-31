"""Twilio inbound webhook handler.

Handles incoming SMS and voice calls from Twilio.
"""

import hashlib
import hmac
import json
import os
from typing import Any
from urllib.parse import parse_qs, urlencode

import structlog

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Twilio inbound webhooks.

    Routes:
        POST /webhooks/twilio/sms   - Inbound SMS
        POST /webhooks/twilio/voice - Inbound voice call
    """
    path = event.get("path", "")

    try:
        # Parse body (Twilio sends form-encoded data)
        body = event.get("body", "")
        is_base64 = event.get("isBase64Encoded", False)

        if is_base64:
            import base64
            body = base64.b64decode(body).decode("utf-8")

        # Parse form data
        if body:
            params = parse_qs(body)
            # Convert lists to single values
            data = {k: v[0] if len(v) == 1 else v for k, v in params.items()}
        else:
            data = {}

        # Validate Twilio signature (optional but recommended)
        if not _validate_twilio_signature(event, body):
            logger.warning("Invalid Twilio signature")
            # Continue anyway for now - in production you'd reject

        if "/sms" in path:
            return handle_inbound_sms(data)
        elif "/voice" in path:
            return handle_inbound_voice(data)
        else:
            return _twiml_response("")

    except Exception as e:
        logger.exception("Twilio webhook error", error=str(e))
        return _twiml_response("")


def handle_inbound_sms(data: dict) -> dict:
    """Handle inbound SMS message.

    Args:
        data: Twilio webhook data.

    Returns:
        TwiML response.
    """
    from_number = data.get("From", "")
    to_number = data.get("To", "")
    body = data.get("Body", "")
    message_sid = data.get("MessageSid", "")

    logger.info(
        "Inbound SMS received",
        from_number=from_number,
        to_number=to_number,
        message_sid=message_sid,
        body_length=len(body),
    )

    # Find workspace by phone number
    workspace = _find_workspace_by_phone(to_number)
    if not workspace:
        logger.warning("No workspace found for phone number", phone=to_number)
        return _twiml_response("")

    # Find or create contact
    contact, created = _find_or_create_contact(workspace["id"], from_number)

    logger.info(
        "Contact resolved",
        contact_id=contact["id"],
        was_created=created,
    )

    # Create or get conversation
    conversation = _get_or_create_conversation(
        workspace_id=workspace["id"],
        contact_id=contact["id"],
        channel="sms",
    )

    # Store the message
    _store_message(
        conversation_id=conversation["id"],
        workspace_id=workspace["id"],
        contact_id=contact["id"],
        content=body,
        direction="inbound",
        channel="sms",
        external_id=message_sid,
    )

    # Trigger workflows for sms_received
    _trigger_sms_received_workflows(
        workspace_id=workspace["id"],
        contact_id=contact["id"],
        conversation_id=conversation["id"],
        trigger_data={
            "from_number": from_number,
            "to_number": to_number,
            "body": body,
            "message_sid": message_sid,
        },
    )

    # Return empty TwiML - response will be handled async
    return _twiml_response("")


def handle_inbound_voice(data: dict) -> dict:
    """Handle inbound voice call.

    Args:
        data: Twilio webhook data.

    Returns:
        TwiML response.
    """
    from_number = data.get("From", "")
    to_number = data.get("To", "")
    call_sid = data.get("CallSid", "")

    logger.info(
        "Inbound voice call",
        from_number=from_number,
        to_number=to_number,
        call_sid=call_sid,
    )

    # Return basic TwiML greeting
    twiml = """
    <Response>
        <Say>Thank you for calling. Please leave a message after the beep.</Say>
        <Record maxLength="60" action="/webhooks/twilio/voice/recording" />
    </Response>
    """

    return _twiml_response(twiml)


def _validate_twilio_signature(event: dict, body: str) -> bool:
    """Validate Twilio webhook signature.

    Args:
        event: API Gateway event.
        body: Request body.

    Returns:
        True if valid.
    """
    auth_token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not auth_token:
        logger.debug("Twilio auth token not configured, skipping signature validation")
        return True  # Skip validation if not configured

    headers = event.get("headers", {}) or {}
    signature = headers.get("X-Twilio-Signature") or headers.get("x-twilio-signature")

    if not signature:
        logger.warning("No Twilio signature header found")
        return False

    try:
        from twilio.request_validator import RequestValidator

        # Reconstruct the URL
        # API Gateway provides these in the requestContext
        request_context = event.get("requestContext", {})
        domain = request_context.get("domainName", "")
        path = event.get("path", "")
        stage = request_context.get("stage", "")

        # Build the full URL
        if domain:
            # Remove stage from path if it's duplicated
            if path.startswith(f"/{stage}"):
                path = path[len(f"/{stage}"):]
            url = f"https://{domain}/{stage}{path}"
        else:
            # Fallback: cannot validate without URL
            logger.warning("Cannot determine webhook URL for signature validation")
            return True

        # Parse the body into params
        params = {}
        if body:
            parsed = parse_qs(body)
            params = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}

        validator = RequestValidator(auth_token)
        is_valid = validator.validate(url, params, signature)

        if not is_valid:
            logger.warning(
                "Invalid Twilio signature",
                url=url,
                signature=signature[:20] + "...",
            )

        return is_valid

    except ImportError:
        logger.warning("twilio package not available for signature validation")
        return True
    except Exception as e:
        logger.error("Signature validation error", error=str(e))
        return True  # Fail open to avoid blocking webhooks


def _twiml_response(twiml: str) -> dict:
    """Build TwiML response.

    Args:
        twiml: TwiML content.

    Returns:
        API Gateway response.
    """
    if not twiml.strip():
        twiml = "<Response></Response>"
    elif not twiml.strip().startswith("<Response"):
        twiml = f"<Response>{twiml}</Response>"

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/xml",
        },
        "body": twiml,
    }


def _find_workspace_by_phone(phone: str) -> dict | None:
    """Find workspace by Twilio phone number.

    Args:
        phone: Phone number.

    Returns:
        Workspace dict or None.
    """
    from complens.repositories.workspace import WorkspaceRepository

    repo = WorkspaceRepository()
    workspace = repo.find_by_phone(phone)

    if workspace:
        return workspace.model_dump()
    return None


def _find_or_create_contact(workspace_id: str, phone: str) -> tuple[dict, bool]:
    """Find or create contact by phone.

    Args:
        workspace_id: Workspace ID.
        phone: Phone number.

    Returns:
        Tuple of (contact dict, was_created).
    """
    from complens.repositories.contact import ContactRepository

    repo = ContactRepository()
    contact, created = repo.find_or_create_by_phone(
        workspace_id, phone, {"sms_opt_in": True}
    )

    return contact.model_dump(), created


def _get_or_create_conversation(
    workspace_id: str,
    contact_id: str,
    channel: str,
) -> dict:
    """Get or create conversation.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        channel: Channel type.

    Returns:
        Conversation dict.
    """
    from complens.models.conversation import Conversation, ConversationChannel, ConversationStatus
    from complens.repositories.conversation import ConversationRepository

    repo = ConversationRepository()

    # Get latest open conversation
    conversations = repo.list_by_contact(contact_id, limit=1)
    for conv in conversations:
        if conv.status == ConversationStatus.OPEN and conv.channel.value == channel:
            return conv.model_dump()

    # Create new conversation
    conversation = Conversation(
        workspace_id=workspace_id,
        contact_id=contact_id,
        channel=ConversationChannel(channel),
    )

    conversation = repo.create_conversation(conversation)
    return conversation.model_dump()


def _store_message(
    conversation_id: str,
    workspace_id: str,
    contact_id: str,
    content: str,
    direction: str,
    channel: str,
    external_id: str,
) -> dict:
    """Store a message.

    Args:
        conversation_id: Conversation ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        content: Message content.
        direction: inbound/outbound.
        channel: Channel type.
        external_id: External message ID.

    Returns:
        Message dict.
    """
    import boto3

    from complens.models.message import (
        Message,
        MessageChannel,
        MessageDirection,
        MessageSender,
        MessageStatus,
    )

    message = Message(
        conversation_id=conversation_id,
        workspace_id=workspace_id,
        contact_id=contact_id,
        content=content,
        direction=MessageDirection(direction),
        channel=MessageChannel(channel),
        sender_type=MessageSender.CONTACT if direction == "inbound" else MessageSender.SYSTEM,
        status=MessageStatus.DELIVERED,
        external_id=external_id,
    )

    # Save to DynamoDB
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("TABLE_NAME", "complens-dev"))

    db_item = message.to_dynamodb()
    db_item["PK"] = message.get_pk()
    db_item["SK"] = message.get_sk()

    table.put_item(Item=db_item)

    return message.model_dump()


def _trigger_sms_received_workflows(
    workspace_id: str,
    contact_id: str,
    conversation_id: str,
    trigger_data: dict,
) -> None:
    """Trigger workflows for SMS received event.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        conversation_id: Conversation ID.
        trigger_data: Trigger event data.
    """
    import boto3

    # Queue workflow trigger
    queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
    if not queue_url:
        return

    sqs = boto3.client("sqs")

    sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps({
            "event_type": "trigger_sms_received",
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "conversation_id": conversation_id,
            "trigger_data": trigger_data,
        }),
    )

    logger.info("Workflow trigger queued", event_type="trigger_sms_received")
