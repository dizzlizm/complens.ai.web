"""WebSocket message handler."""

import json
import os
import time
from typing import Any

import boto3
import structlog

from complens.repositories.business_profile import BusinessProfileRepository
from complens.repositories.document import DocumentRepository
from complens.repositories.page import PageRepository
from complens.utils.rate_limiter import check_rate_limit

logger = structlog.get_logger()

# Bedrock model for chat responses
CHAT_MODEL = os.environ.get("CHAT_MODEL", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle WebSocket messages.

    Args:
        event: API Gateway WebSocket event.
        context: Lambda context.

    Returns:
        Message response.
    """
    connection_id = event.get("requestContext", {}).get("connectionId")
    domain = event.get("requestContext", {}).get("domainName")
    stage = event.get("requestContext", {}).get("stage")

    if not connection_id:
        logger.error("No connection ID in event")
        return {"statusCode": 400}

    # Parse message body
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return {"statusCode": 400, "body": "Invalid JSON"}

    action = body.get("action")
    data = body.get("data", {})

    logger.info(
        "WebSocket message received",
        connection_id=connection_id,
        action=action,
    )

    # Handle different actions
    if action == "subscribe":
        return handle_subscribe(connection_id, data)
    elif action == "unsubscribe":
        return handle_unsubscribe(connection_id, data)
    elif action == "ping":
        return send_to_connection(connection_id, domain, stage, {"action": "pong"})
    elif action == "public_chat":
        return handle_public_chat(connection_id, domain, stage, body)
    else:
        logger.warning("Unknown action", action=action)
        return {"statusCode": 400, "body": f"Unknown action: {action}"}


def handle_public_chat(
    connection_id: str,
    domain: str,
    stage: str,
    body: dict,
) -> dict:
    """Handle public chat message from landing page.

    Args:
        connection_id: WebSocket connection ID.
        domain: API Gateway domain.
        stage: API Gateway stage.
        body: Message body with page_id, workspace_id, message, visitor_id.

    Returns:
        Response.
    """
    page_id = body.get("page_id")
    workspace_id = body.get("workspace_id")
    message = body.get("message", "")
    visitor_id = body.get("visitor_id", "anonymous")

    # PERFORMANCE: workspace_id is now required to avoid O(n) table scan
    # The frontend should always include workspace_id from the page config
    if not page_id or not message:
        return {"statusCode": 400, "body": "page_id and message are required"}

    if not workspace_id:
        logger.warning(
            "PERFORMANCE: workspace_id not provided for public chat - rejecting to avoid table scan",
            page_id=page_id,
        )
        send_to_connection(
            connection_id,
            domain,
            stage,
            {
                "action": "ai_response",
                "message": "Configuration error. Please refresh the page and try again.",
            },
        )
        return {"statusCode": 400, "body": "workspace_id is required"}

    # Rate limit: 5 messages/minute, 30/hour per visitor
    source_ip = (
        body.get("requestContext", {}).get("identity", {}).get("sourceIp")
        or visitor_id
    )
    rate_check = check_rate_limit(
        identifier=source_ip,
        action="public_chat",
        requests_per_minute=5,
        requests_per_hour=30,
    )
    if not rate_check.allowed:
        send_to_connection(
            connection_id,
            domain,
            stage,
            {
                "action": "ai_response",
                "message": "You're sending messages too quickly. Please wait a moment and try again.",
            },
        )
        return {"statusCode": 429}

    logger.info(
        "Public chat message",
        page_id=page_id,
        workspace_id=workspace_id,
        visitor_id=visitor_id,
        message_length=len(message),
    )

    # Look up page to get AI persona and context
    try:
        page_repo = PageRepository()

        # Direct query by workspace_id + page_id is O(1)
        page = page_repo.get_by_id(workspace_id, page_id)

        if not page:
            logger.warning("Page not found", page_id=page_id)
            send_to_connection(
                connection_id,
                domain,
                stage,
                {
                    "action": "ai_response",
                    "message": "Sorry, I couldn't find the page configuration. Please try again later.",
                },
            )
            return {"statusCode": 404}

        # Build AI prompt with page context
        # chat_config can be a Pydantic model or None
        chat_config = page.chat_config
        if chat_config:
            # Handle both Pydantic model and dict
            if hasattr(chat_config, 'ai_persona'):
                ai_persona = chat_config.ai_persona or "You are a helpful assistant."
                business_context = chat_config.business_context or {}
            else:
                ai_persona = chat_config.get("ai_persona") or "You are a helpful assistant."
                business_context = chat_config.get("business_context", {})
        else:
            ai_persona = "You are a helpful assistant."
            business_context = {}

        # Fetch business profile for richer AI context
        profile_context = ""
        try:
            profile_repo = BusinessProfileRepository()
            profile = profile_repo.get_effective_profile(page.workspace_id, page_id)
            if profile:
                profile_context = profile.get_ai_context()
        except Exception as e:
            logger.warning("Business profile fetch skipped", error=str(e))

        # Fetch knowledge base documents directly from S3
        kb_context = ""
        try:
            kb_context = _get_document_context(page.workspace_id)
        except Exception as e:
            logger.warning("KB document fetch skipped", error=str(e))

        system_prompt = f"""{ai_persona}

{profile_context}

Page Context:
- Page Name: {page.name}
- Headline: {page.headline}
{f"- Business Context: {json.dumps(business_context)}" if business_context else ""}
{kb_context}
Keep responses concise and helpful. Use the business profile and knowledge base documents above to give informed, accurate answers. If you don't know something, say so politely.
You may use markdown formatting (bold, lists, links) when it improves readability."""

        # Fire EventBridge event for workflow triggers
        _fire_chat_event(
            workspace_id=page.workspace_id,
            page_id=page_id,
            page_name=page.name,
            visitor_id=visitor_id,
            message=message,
        )

        # Call Bedrock for AI response
        ai_response = _generate_chat_response(system_prompt, message)

        # Send response back to client
        send_to_connection(
            connection_id,
            domain,
            stage,
            {"action": "ai_response", "message": ai_response},
        )

        return {"statusCode": 200}

    except Exception as e:
        logger.error("Chat processing failed", error=str(e))
        send_to_connection(
            connection_id,
            domain,
            stage,
            {
                "action": "ai_response",
                "message": "Sorry, I encountered an error. Please try again.",
            },
        )
        return {"statusCode": 500}


def _get_document_context(workspace_id: str, max_chars: int = 8000) -> str:
    """Fetch indexed KB document content directly from S3.

    Reads text-based documents and concatenates them for the system prompt.
    Limits total context to max_chars to avoid exceeding model limits.

    Args:
        workspace_id: Workspace ID.
        max_chars: Maximum characters of document content to include.

    Returns:
        Formatted document context string, or empty string if none.
    """
    doc_repo = DocumentRepository()
    documents, _ = doc_repo.list_by_workspace(workspace_id, status="indexed", limit=20)

    if not documents:
        return ""

    s3 = boto3.client("s3")
    bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
    if not bucket:
        return ""

    TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "text/html", "application/json"}
    snippets = []
    total_chars = 0

    for doc in documents:
        if not doc.file_key:
            continue
        # Only read text-based files (skip PDFs, DOCX for now)
        if doc.content_type not in TEXT_TYPES:
            continue

        try:
            obj = s3.get_object(Bucket=bucket, Key=doc.file_key)
            content = obj["Body"].read().decode("utf-8", errors="replace")

            # Truncate individual doc if needed
            remaining = max_chars - total_chars
            if remaining <= 0:
                break
            if len(content) > remaining:
                content = content[:remaining] + "..."

            snippets.append(f"--- Document: {doc.name} ---\n{content}")
            total_chars += len(content)
        except Exception as e:
            logger.warning("Failed to read KB document", document_id=doc.id, error=str(e))

    if not snippets:
        return ""

    logger.info("KB documents loaded", workspace_id=workspace_id, count=len(snippets), chars=total_chars)
    return "\n\nKnowledge Base Documents:\n" + "\n\n".join(snippets)


def _fire_chat_event(
    workspace_id: str,
    page_id: str,
    page_name: str,
    visitor_id: str,
    message: str,
) -> None:
    """Fire EventBridge events for chat triggers.

    Args:
        workspace_id: Workspace ID.
        page_id: Page ID.
        page_name: Page name.
        visitor_id: Visitor ID.
        message: Chat message.
    """
    from datetime import datetime, timezone

    try:
        events = boto3.client("events")

        # Fire chat_message event (workflows can filter by keyword)
        event_bus_name = os.environ.get("EVENT_BUS_NAME", "default")
        events.put_events(
            Entries=[
                {
                    "Source": "complens.chat",
                    "DetailType": "chat_message",
                    "EventBusName": event_bus_name,
                    "Detail": json.dumps({
                        "workspace_id": workspace_id,
                        "trigger_type": "trigger_chat_message",
                        "page_id": page_id,
                        "page_name": page_name,
                        "visitor_id": visitor_id,
                        "message": message,
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                    }),
                }
            ]
        )

        logger.info(
            "Chat event fired",
            workspace_id=workspace_id,
            page_id=page_id,
            visitor_id=visitor_id,
        )

    except Exception as e:
        # Don't fail the chat if events fail
        logger.warning("Failed to fire chat event", error=str(e))


def _generate_chat_response(system_prompt: str, user_message: str) -> str:
    """Generate AI response using Bedrock.

    Args:
        system_prompt: System prompt with AI persona.
        user_message: User's message.

    Returns:
        AI response text.
    """
    from botocore.config import Config

    bedrock = boto3.client(
        "bedrock-runtime",
        config=Config(
            read_timeout=30,
            connect_timeout=10,
            retries={"max_attempts": 1, "mode": "standard"},
        ),
    )

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_message}],
    }

    try:
        response = bedrock.invoke_model(
            modelId=CHAT_MODEL,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]

    except Exception as e:
        logger.error("Bedrock invocation failed", error=str(e))
        return "I'm having trouble connecting right now. Please try again in a moment."


def handle_subscribe(connection_id: str, data: dict) -> dict:
    """Handle subscription request.

    Args:
        connection_id: WebSocket connection ID.
        data: Subscription data.

    Returns:
        Response.
    """
    channel = data.get("channel")
    resource_id = data.get("resource_id")

    if not channel:
        return {"statusCode": 400, "body": "Channel is required"}

    logger.info(
        "Subscribing to channel",
        connection_id=connection_id,
        channel=channel,
        resource_id=resource_id,
    )

    # Update connection record with subscriptions
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    # Build update expression
    update_expr = "ADD subscriptions :sub"
    expr_values = {":sub": {f"{channel}:{resource_id}" if resource_id else channel}}

    # If subscribing to a workflow channel with workspace resource_id, set workspaceId for GSI
    if channel == "workflow" and resource_id:
        update_expr += " SET workspaceId = if_not_exists(workspaceId, :ws)"
        expr_values[":ws"] = resource_id

    table.update_item(
        Key={"connectionId": connection_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
    )

    return {"statusCode": 200}


def handle_unsubscribe(connection_id: str, data: dict) -> dict:
    """Handle unsubscribe request.

    Args:
        connection_id: WebSocket connection ID.
        data: Unsubscribe data.

    Returns:
        Response.
    """
    channel = data.get("channel")
    resource_id = data.get("resource_id")

    if not channel:
        return {"statusCode": 400, "body": "Channel is required"}

    logger.info(
        "Unsubscribing from channel",
        connection_id=connection_id,
        channel=channel,
        resource_id=resource_id,
    )

    # Remove subscription from connection
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    table.update_item(
        Key={"connectionId": connection_id},
        UpdateExpression="DELETE subscriptions :sub",
        ExpressionAttributeValues={
            ":sub": {f"{channel}:{resource_id}" if resource_id else channel}
        },
    )

    return {"statusCode": 200}


def send_to_connection(
    connection_id: str,
    domain: str,
    stage: str,
    message: dict,
) -> dict:
    """Send message to a WebSocket connection.

    Args:
        connection_id: Target connection ID.
        domain: API Gateway domain.
        stage: API Gateway stage.
        message: Message to send.

    Returns:
        Response.
    """
    # For custom domains (e.g., ws.dev.complens.ai), don't include stage in path
    # For default API Gateway domains (e.g., xxx.execute-api.region.amazonaws.com), include stage
    if "execute-api" in domain:
        endpoint = f"https://{domain}/{stage}"
    else:
        # Custom domain - stage is already mapped, don't include it
        endpoint = f"https://{domain}"

    logger.debug("Sending to connection", connection_id=connection_id, endpoint=endpoint)

    apigw = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=endpoint,
    )

    try:
        apigw.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(message).encode("utf-8"),
        )
        return {"statusCode": 200}
    except apigw.exceptions.GoneException:
        logger.info("Connection is gone", connection_id=connection_id)
        # Connection no longer exists - clean up
        _remove_stale_connection(connection_id)
        return {"statusCode": 410}
    except Exception as e:
        logger.error("Failed to send message", error=str(e))
        return {"statusCode": 500}


def _remove_stale_connection(connection_id: str) -> None:
    """Remove stale connection from DynamoDB.

    Args:
        connection_id: Connection ID to remove.
    """
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    try:
        table.delete_item(Key={"connectionId": connection_id})
    except Exception:
        pass


def broadcast_to_workspace(
    workspace_id: str,
    message: dict,
    endpoint: str | None = None,
) -> int:
    """Broadcast message to all connections subscribed to a workspace.

    Args:
        workspace_id: Workspace ID.
        message: Message to broadcast.
        endpoint: WebSocket endpoint URL (optional, uses env var if not provided).

    Returns:
        Number of connections that received the message.
    """
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    # Use WorkspaceIdIndex GSI for O(n) query instead of full table scan
    # This is much more efficient as table grows
    try:
        response = table.query(
            IndexName="WorkspaceIdIndex",
            KeyConditionExpression="workspaceId = :ws",
            ExpressionAttributeValues={":ws": workspace_id},
        )
        items = response.get("Items", [])

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = table.query(
                IndexName="WorkspaceIdIndex",
                KeyConditionExpression="workspaceId = :ws",
                ExpressionAttributeValues={":ws": workspace_id},
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

    except Exception as e:
        # Fallback to scan if GSI doesn't exist yet (during deployment transition)
        logger.warning("GSI query failed, falling back to scan", error=str(e))
        response = table.scan(
            FilterExpression="contains(workspaceIds, :ws)",
            ExpressionAttributeValues={":ws": workspace_id},
        )
        items = response.get("Items", [])

        while "LastEvaluatedKey" in response:
            response = table.scan(
                FilterExpression="contains(workspaceIds, :ws)",
                ExpressionAttributeValues={":ws": workspace_id},
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

    if not items:
        logger.debug("No connections for workspace", workspace_id=workspace_id)
        return 0

    # Get WebSocket endpoint from environment or parameter
    ws_endpoint = endpoint or os.environ.get("WEBSOCKET_ENDPOINT")
    if not ws_endpoint:
        logger.warning("No WebSocket endpoint configured")
        return 0

    apigw = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=ws_endpoint,
    )

    sent_count = 0
    stale_connections = []

    for item in items:
        connection_id = item.get("connectionId")
        if not connection_id:
            continue

        try:
            apigw.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(message).encode("utf-8"),
            )
            sent_count += 1
        except apigw.exceptions.GoneException:
            # Connection is stale, mark for cleanup
            stale_connections.append(connection_id)
        except Exception as e:
            logger.warning(
                "Failed to send to connection",
                connection_id=connection_id,
                error=str(e),
            )

    # Clean up stale connections
    for stale_id in stale_connections:
        _remove_stale_connection(stale_id)

    logger.info(
        "Broadcast complete",
        workspace_id=workspace_id,
        sent=sent_count,
        stale_removed=len(stale_connections),
    )

    return sent_count


def broadcast_workflow_event(
    workspace_id: str,
    event_type: str,
    workflow_id: str,
    run_id: str | None = None,
    data: dict | None = None,
    endpoint: str | None = None,
) -> int:
    """Broadcast a workflow event to all workspace connections.

    Args:
        workspace_id: Workspace ID.
        event_type: Event type (e.g., "workflow.started", "workflow.completed", "step.completed").
        workflow_id: Workflow ID.
        run_id: Workflow run ID (optional).
        data: Additional event data.
        endpoint: WebSocket endpoint URL (optional).

    Returns:
        Number of connections that received the message.
    """
    message = {
        "action": "workflow_event",
        "event": event_type,
        "workflow_id": workflow_id,
        "run_id": run_id,
        "workspace_id": workspace_id,
        "data": data or {},
        "timestamp": int(time.time() * 1000),
    }

    return broadcast_to_workspace(workspace_id, message, endpoint)
