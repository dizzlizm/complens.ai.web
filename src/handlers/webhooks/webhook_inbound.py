"""Inbound webhook handler.

Receives external HTTP calls and forwards them to the workflow queue
for trigger_webhook matching.
"""

import json
import os
from datetime import datetime, timezone
from typing import Any

import boto3
import structlog

from complens.utils.responses import success, error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle inbound webhook requests.

    Routes:
        POST /public/webhooks/{workspace_id}/{proxy+}
        GET  /public/webhooks/{workspace_id}/{proxy+}
    """
    try:
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        webhook_path = path_params.get("proxy", "")

        if not workspace_id:
            return error("Missing workspace_id", 400)

        http_method = event.get("httpMethod", "POST").upper()
        headers = event.get("headers", {}) or {}
        query_params = event.get("queryStringParameters", {}) or {}

        # Parse body
        body_raw = event.get("body", "")
        if event.get("isBase64Encoded") and body_raw:
            import base64
            body_raw = base64.b64decode(body_raw).decode("utf-8", errors="replace")

        # Try to parse as JSON, fall back to raw string
        try:
            body = json.loads(body_raw) if body_raw else {}
        except (json.JSONDecodeError, TypeError):
            body = {"raw": body_raw}

        logger.info(
            "Inbound webhook received",
            workspace_id=workspace_id,
            webhook_path=webhook_path,
            method=http_method,
        )

        # Build trigger event
        now = datetime.now(timezone.utc)
        message = {
            "detail": {
                "trigger_type": "trigger_webhook",
                "workspace_id": workspace_id,
                "webhook_path": webhook_path,
                "data": {
                    "method": http_method,
                    "headers": dict(headers),
                    "body": body,
                    "query_params": dict(query_params),
                },
                "contact_id": None,
                "created_at": now.isoformat(),
            },
        }

        # Send to workflow queue
        queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
        if not queue_url:
            logger.error("WORKFLOW_QUEUE_URL not configured")
            return success({"ok": True})

        sqs = boto3.client("sqs")
        sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message),
            MessageGroupId=workspace_id,
        )

        logger.info(
            "Webhook forwarded to queue",
            workspace_id=workspace_id,
            webhook_path=webhook_path,
        )

        return success({"ok": True})

    except Exception as e:
        logger.exception("Webhook handler error", error=str(e))
        # Don't leak internal errors to external callers
        return success({"ok": True})
