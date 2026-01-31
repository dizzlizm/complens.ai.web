"""WebSocket message handler."""

import json
import os
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


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
    else:
        logger.warning("Unknown action", action=action)
        return {"statusCode": 400, "body": f"Unknown action: {action}"}


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

    # Add subscription to connection
    table.update_item(
        Key={"connectionId": connection_id},
        UpdateExpression="ADD subscriptions :sub",
        ExpressionAttributeValues={
            ":sub": {f"{channel}:{resource_id}" if resource_id else channel}
        },
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
    endpoint = f"https://{domain}/{stage}"

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


def broadcast_to_workspace(workspace_id: str, message: dict) -> None:
    """Broadcast message to all connections subscribed to a workspace.

    Args:
        workspace_id: Workspace ID.
        message: Message to broadcast.
    """
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    # Query connections by workspace (using GSI)
    response = table.query(
        IndexName="UserIdIndex",
        KeyConditionExpression="userId = :uid",
        FilterExpression="contains(workspaceIds, :ws)",
        ExpressionAttributeValues={
            ":uid": "*",  # Would need proper query
            ":ws": workspace_id,
        },
    )

    # Get WebSocket endpoint from environment
    endpoint = os.environ.get("WEBSOCKET_ENDPOINT")
    if not endpoint:
        return

    apigw = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=endpoint,
    )

    for item in response.get("Items", []):
        connection_id = item.get("connectionId")
        try:
            apigw.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(message).encode("utf-8"),
            )
        except Exception:
            pass
