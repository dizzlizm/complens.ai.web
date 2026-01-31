"""WebSocket connect handler."""

import os
import time
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle WebSocket connection.

    Args:
        event: API Gateway WebSocket event.
        context: Lambda context.

    Returns:
        Connection response.
    """
    connection_id = event.get("requestContext", {}).get("connectionId")

    if not connection_id:
        logger.error("No connection ID in event")
        return {"statusCode": 400}

    logger.info("WebSocket connect", connection_id=connection_id)

    # Get query parameters for auth
    query_params = event.get("queryStringParameters", {}) or {}
    token = query_params.get("token")

    # Validate token and get user info
    user_id = None
    workspace_ids = []

    if token:
        try:
            user_info = _validate_token(token)
            user_id = user_info.get("user_id")
            workspace_ids = user_info.get("workspace_ids", [])
        except Exception as e:
            logger.warning("Token validation failed", error=str(e))
            # Allow connection anyway for now - can restrict later

    # Store connection in DynamoDB
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    ttl = int(time.time()) + 86400  # 24 hours

    table.put_item(
        Item={
            "connectionId": connection_id,
            "userId": user_id or "anonymous",
            "workspaceIds": workspace_ids,
            "connectedAt": int(time.time()),
            "ttl": ttl,
        }
    )

    logger.info(
        "Connection stored",
        connection_id=connection_id,
        user_id=user_id,
    )

    return {"statusCode": 200}


def _validate_token(token: str) -> dict:
    """Validate JWT token.

    Args:
        token: JWT token.

    Returns:
        User info dict.
    """
    # Simplified validation - in production use full JWT validation
    import jwt

    try:
        # Decode without verification for now
        # In production, use the same validation as jwt_authorizer.py
        claims = jwt.decode(token, options={"verify_signature": False})

        return {
            "user_id": claims.get("sub"),
            "email": claims.get("email"),
            "workspace_ids": claims.get("custom:workspace_ids", "").split(","),
        }
    except Exception:
        return {}
