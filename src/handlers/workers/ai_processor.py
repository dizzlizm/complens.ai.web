"""AI processor worker.

Processes AI-related tasks from the SQS queue.
"""

import asyncio
import json
import os
from typing import Any

import structlog

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process AI tasks from SQS queue.

    Args:
        event: SQS event with records.
        context: Lambda context.

    Returns:
        Processing result.
    """
    records = event.get("Records", [])

    logger.info("Processing AI queue", record_count=len(records))

    results = []
    for record in records:
        try:
            body = json.loads(record.get("body", "{}"))
            message_type = body.get("type")

            if message_type == "inbound_message":
                result = process_inbound_message(body)
            elif message_type == "generate_response":
                result = process_generate_response(body)
            else:
                logger.warning("Unknown message type", type=message_type)
                result = {"success": False, "error": "Unknown message type"}

            results.append(result)

        except Exception as e:
            logger.exception("Failed to process AI message", error=str(e))
            results.append({"success": False, "error": str(e)})

    return {
        "batchItemFailures": [
            {"itemIdentifier": records[i]["messageId"]}
            for i, r in enumerate(results)
            if not r.get("success", False)
        ]
    }


def process_inbound_message(data: dict) -> dict:
    """Process an inbound message for AI response.

    Args:
        data: Message data.

    Returns:
        Processing result.
    """
    message_id = data.get("message_id")
    conversation_id = data.get("conversation_id")
    workspace_id = data.get("workspace_id")
    contact_id = data.get("contact_id")
    content = data.get("content")
    channel = data.get("channel")

    logger.info(
        "Processing inbound message for AI",
        message_id=message_id,
        conversation_id=conversation_id,
    )

    # Get contact
    from complens.repositories.contact import ContactRepository
    contact_repo = ContactRepository()
    contact = contact_repo.get_by_id(workspace_id, contact_id)

    if not contact:
        logger.warning("Contact not found", contact_id=contact_id)
        return {"success": False, "error": "Contact not found"}

    # Get conversation
    from complens.repositories.conversation import ConversationRepository
    conv_repo = ConversationRepository()
    conversation = conv_repo.get_by_id(workspace_id, conversation_id)

    if not conversation:
        logger.warning("Conversation not found", conversation_id=conversation_id)
        return {"success": False, "error": "Conversation not found"}

    # Check if AI is enabled for this conversation
    if not conversation.ai_enabled or conversation.ai_handoff_requested:
        logger.info("AI disabled for conversation", conversation_id=conversation_id)
        return {"success": True, "skipped": True}

    # Get message history
    message_history = _get_message_history(conversation_id)

    # Generate AI response
    from complens.services.ai_agent import AIAgentService

    agent = AIAgentService()

    # Run async code
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            agent.generate_response(
                contact=contact,
                conversation=conversation,
                message_history=message_history,
                latest_message=content,
            )
        )
    finally:
        loop.close()

    ai_response = result.get("response")
    tool_calls = result.get("tool_calls", [])
    actions_taken = result.get("actions_taken", [])

    if ai_response:
        # Store AI response as a message
        _store_ai_response(
            conversation_id=conversation_id,
            workspace_id=workspace_id,
            contact_id=contact_id,
            content=ai_response,
            channel=channel,
        )

        # Send the response via the appropriate channel
        _send_response(
            contact=contact,
            content=ai_response,
            channel=channel,
        )

    logger.info(
        "AI response generated",
        conversation_id=conversation_id,
        response_length=len(ai_response) if ai_response else 0,
        tool_calls_count=len(tool_calls),
    )

    return {
        "success": True,
        "response_generated": bool(ai_response),
        "tool_calls": len(tool_calls),
    }


def process_generate_response(data: dict) -> dict:
    """Generate AI response for a specific prompt.

    Args:
        data: Request data.

    Returns:
        Processing result.
    """
    prompt = data.get("prompt")
    context = data.get("context", {})

    if not prompt:
        return {"success": False, "error": "Prompt is required"}

    # Generate response using Bedrock directly
    import boto3

    bedrock = boto3.client("bedrock-runtime")

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": data.get("max_tokens", 500),
        "messages": [{"role": "user", "content": prompt}],
    }

    if context.get("system_prompt"):
        body["system"] = context["system_prompt"]

    response = bedrock.invoke_model(
        modelId=data.get("model", "anthropic.claude-3-sonnet-20240229-v1:0"),
        body=json.dumps(body),
        contentType="application/json",
    )

    response_body = json.loads(response["body"].read())
    generated_text = response_body["content"][0]["text"]

    return {
        "success": True,
        "response": generated_text,
    }


def _get_message_history(conversation_id: str, limit: int = 10) -> list[dict]:
    """Get message history for a conversation.

    Args:
        conversation_id: Conversation ID.
        limit: Max messages to retrieve.

    Returns:
        List of message dicts.
    """
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
        ScanIndexForward=False,
    )

    messages = []
    for item in reversed(response.get("Items", [])):
        messages.append({
            "content": item.get("content"),
            "direction": item.get("direction"),
            "sender_type": item.get("sender_type"),
        })

    return messages


def _store_ai_response(
    conversation_id: str,
    workspace_id: str,
    contact_id: str,
    content: str,
    channel: str,
) -> None:
    """Store AI response as a message.

    Args:
        conversation_id: Conversation ID.
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        content: Response content.
        channel: Channel type.
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
        direction=MessageDirection.OUTBOUND,
        channel=MessageChannel(channel),
        sender_type=MessageSender.AI,
        status=MessageStatus.PENDING,
        ai_generated=True,
    )

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("TABLE_NAME", "complens-dev"))

    db_item = message.to_dynamodb()
    db_item["PK"] = message.get_pk()
    db_item["SK"] = message.get_sk()

    table.put_item(Item=db_item)


def _send_response(contact, content: str, channel: str) -> None:
    """Send response to contact via the appropriate channel.

    Args:
        contact: Contact object.
        content: Response content.
        channel: Channel type.
    """
    # TODO: Implement actual sending via Twilio/SES
    logger.info(
        "Would send response",
        channel=channel,
        contact_id=contact.id,
        content_length=len(content),
    )
