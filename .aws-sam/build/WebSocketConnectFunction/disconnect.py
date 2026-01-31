"""WebSocket disconnect handler."""

import os
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle WebSocket disconnection.

    Args:
        event: API Gateway WebSocket event.
        context: Lambda context.

    Returns:
        Disconnection response.
    """
    connection_id = event.get("requestContext", {}).get("connectionId")

    if not connection_id:
        logger.error("No connection ID in event")
        return {"statusCode": 400}

    logger.info("WebSocket disconnect", connection_id=connection_id)

    # Remove connection from DynamoDB
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    try:
        table.delete_item(Key={"connectionId": connection_id})
        logger.info("Connection removed", connection_id=connection_id)
    except Exception as e:
        logger.warning("Failed to remove connection", error=str(e))

    return {"statusCode": 200}
