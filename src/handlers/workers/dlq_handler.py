"""Dead Letter Queue handler for automatic workflow error remediation.

Processes messages from the workflow DLQ and attempts automatic recovery:
1. Classifies the error (transient, recoverable, permanent)
2. For transient: Retries with exponential backoff
3. For recoverable: Applies auto-fixes and retries
4. For permanent: Alerts workspace owner for manual intervention

This handler integrates with:
- ErrorClassifier: Determines error type and recommended action
- RemediationService: Applies automatic fixes
- AlertService: Notifies on permanent failures
- WorkflowRouter: Requeues fixed messages
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import boto3
import structlog

from complens.dlq.error_classifier import (
    ErrorCategory,
    ErrorClassification,
    RecoveryAction,
    classify_error,
)
from complens.dlq.remediation_service import apply_fixes, get_remediation_service
from complens.queue.feature_flags import FeatureFlag, is_flag_enabled
from complens.queue.workflow_router import (
    WorkflowTriggerMessage,
    get_workflow_router,
)

logger = structlog.get_logger()


@dataclass
class DLQMetrics:
    """Metrics for DLQ processing."""

    total_messages: int = 0
    retried_messages: int = 0
    fixed_messages: int = 0
    alerted_messages: int = 0
    discarded_messages: int = 0
    failed_messages: int = 0
    by_category: dict[str, int] = field(default_factory=dict)
    by_action: dict[str, int] = field(default_factory=dict)


# Module-level metrics
_metrics = DLQMetrics()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process DLQ messages with automatic remediation.

    Args:
        event: SQS event with DLQ records.
        context: Lambda context.

    Returns:
        Batch item failures for partial retry.
    """
    records = event.get("Records", [])
    batch_item_failures = []

    logger.info(
        "Processing DLQ messages",
        record_count=len(records),
    )

    for record in records:
        try:
            success = process_dlq_message(record)
            if not success:
                batch_item_failures.append({
                    "itemIdentifier": record.get("messageId"),
                })
        except Exception as e:
            logger.exception(
                "Failed to process DLQ message",
                message_id=record.get("messageId"),
                error=str(e),
            )
            batch_item_failures.append({
                "itemIdentifier": record.get("messageId"),
            })
            _metrics.failed_messages += 1

    # Log metrics summary
    logger.info(
        "DLQ processing complete",
        total=_metrics.total_messages,
        retried=_metrics.retried_messages,
        fixed=_metrics.fixed_messages,
        alerted=_metrics.alerted_messages,
        discarded=_metrics.discarded_messages,
        failed=_metrics.failed_messages,
    )

    return {
        "batchItemFailures": batch_item_failures,
    }


def process_dlq_message(record: dict) -> bool:
    """Process a single DLQ message.

    Args:
        record: SQS record from DLQ.

    Returns:
        True if processed successfully.
    """
    _metrics.total_messages += 1

    message_id = record.get("messageId")
    body = record.get("body", "{}")
    attributes = record.get("messageAttributes", {})

    # Parse the message
    try:
        message_data = json.loads(body)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in DLQ message", message_id=message_id)
        _metrics.discarded_messages += 1
        return True  # Don't retry invalid JSON

    # Extract error information
    error_message = _extract_error_message(message_data, attributes)
    error_details = _extract_error_details(message_data, attributes)
    provider = _extract_provider(message_data, attributes)
    workspace_id = message_data.get("workspace_id")

    # Check if DLQ remediation is enabled
    if not is_flag_enabled(FeatureFlag.ENABLE_DLQ_REMEDIATION, workspace_id):
        logger.info(
            "DLQ remediation disabled",
            workspace_id=workspace_id,
            message_id=message_id,
        )
        return False  # Return to DLQ

    # Get retry count
    retry_count = _get_retry_count(attributes)

    logger.info(
        "Processing DLQ message",
        message_id=message_id,
        workspace_id=workspace_id,
        error_message=error_message[:200] if error_message else None,
        provider=provider,
        retry_count=retry_count,
    )

    # Classify the error
    classification = classify_error(error_message, error_details, provider)

    _metrics.by_category[classification.error_type.value] = (
        _metrics.by_category.get(classification.error_type.value, 0) + 1
    )
    _metrics.by_action[classification.action.value] = (
        _metrics.by_action.get(classification.action.value, 0) + 1
    )

    logger.info(
        "Error classified",
        message_id=message_id,
        error_type=classification.error_type.value,
        action=classification.action.value,
        confidence=classification.confidence,
        reason=classification.reason,
        fixes=([f.value for f in classification.fixes] if classification.fixes else []),
    )

    # Check if max retries exceeded
    if retry_count >= classification.max_retries:
        logger.warning(
            "Max retries exceeded",
            message_id=message_id,
            retry_count=retry_count,
            max_retries=classification.max_retries,
        )
        _send_alert(workspace_id, message_data, classification, "Max retries exceeded")
        _metrics.alerted_messages += 1
        return True  # Remove from queue

    # Handle based on classification
    if classification.action == RecoveryAction.DISCARD:
        logger.info(
            "Discarding message",
            message_id=message_id,
            reason=classification.reason,
        )
        _metrics.discarded_messages += 1
        return True

    elif classification.action == RecoveryAction.ALERT:
        _send_alert(workspace_id, message_data, classification, classification.reason)
        _metrics.alerted_messages += 1
        return True

    elif classification.action in (
        RecoveryAction.RETRY,
        RecoveryAction.RETRY_WITH_BACKOFF,
    ):
        # Retry without modification
        success = _retry_message(
            message_data=message_data,
            workspace_id=workspace_id,
            retry_count=retry_count + 1,
            delay_seconds=_calculate_backoff_delay(
                retry_count,
                classification.retry_delay_seconds,
            ),
        )
        if success:
            _metrics.retried_messages += 1
        return success

    elif classification.action in (
        RecoveryAction.FIX_AND_RETRY,
        RecoveryAction.REDUCE_AND_RETRY,
    ):
        # Apply fixes and retry
        fix_result = apply_fixes(
            message=message_data,
            fixes=classification.fixes,
            context={
                "provider": provider,
                "workspace_id": workspace_id,
            },
        )

        if fix_result.success and fix_result.fixes_applied:
            logger.info(
                "Fixes applied",
                message_id=message_id,
                fixes=[f.value for f in fix_result.fixes_applied],
                changes=fix_result.changes,
            )

            success = _retry_message(
                message_data=fix_result.message,
                workspace_id=workspace_id,
                retry_count=retry_count + 1,
                delay_seconds=10,  # Quick retry after fix
            )
            if success:
                _metrics.fixed_messages += 1
            return success
        else:
            # Fixes failed - alert
            logger.warning(
                "Fixes failed",
                message_id=message_id,
                failed_fixes=[(f.value, e) for f, e in fix_result.fixes_failed],
            )
            _send_alert(workspace_id, message_data, classification, "Auto-fix failed")
            _metrics.alerted_messages += 1
            return True

    elif classification.action == RecoveryAction.REFRESH_AND_RETRY:
        # Token refresh - mark for refresh and retry
        message_data["_refresh_credentials"] = True
        success = _retry_message(
            message_data=message_data,
            workspace_id=workspace_id,
            retry_count=retry_count + 1,
            delay_seconds=30,
        )
        if success:
            _metrics.retried_messages += 1
        return success

    # Default: return to queue for manual handling
    return False


def _extract_error_message(
    message_data: dict,
    attributes: dict,
) -> str:
    """Extract error message from DLQ message.

    Args:
        message_data: Message body data.
        attributes: Message attributes.

    Returns:
        Error message string.
    """
    # Check common error locations
    error = message_data.get("error")
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        return error.get("message") or error.get("Error") or str(error)

    # Check attributes
    error_attr = attributes.get("ErrorMessage", {})
    if isinstance(error_attr, dict):
        return error_attr.get("stringValue", "")

    # Check nested error info
    if "error_message" in message_data:
        return message_data["error_message"]

    if "exception" in message_data:
        exc = message_data["exception"]
        if isinstance(exc, dict):
            return exc.get("message", str(exc))
        return str(exc)

    return ""


def _extract_error_details(
    message_data: dict,
    attributes: dict,
) -> dict:
    """Extract error details from DLQ message.

    Args:
        message_data: Message body data.
        attributes: Message attributes.

    Returns:
        Error details dict.
    """
    details = {}

    # Get error code
    if "error_code" in message_data:
        details["code"] = message_data["error_code"]
    elif "code" in message_data:
        details["code"] = message_data["code"]

    # Get error from nested dict
    error = message_data.get("error")
    if isinstance(error, dict):
        details.update(error)

    # Get from attributes
    code_attr = attributes.get("ErrorCode", {})
    if isinstance(code_attr, dict) and "stringValue" in code_attr:
        details["code"] = code_attr["stringValue"]

    return details


def _extract_provider(
    message_data: dict,
    attributes: dict,
) -> str | None:
    """Extract provider from DLQ message.

    Args:
        message_data: Message body data.
        attributes: Message attributes.

    Returns:
        Provider name or None.
    """
    # Check message data
    if "provider" in message_data:
        return message_data["provider"]

    if "provider_id" in message_data:
        return message_data["provider_id"]

    # Infer from trigger type
    trigger_type = message_data.get("trigger_type", "")
    if "sms" in trigger_type.lower():
        return "twilio"
    if "email" in trigger_type.lower():
        return "ses"

    # Check node type
    node_type = message_data.get("node_type", "")
    if "send_sms" in node_type:
        return "twilio"
    if "send_email" in node_type:
        return "ses"
    if node_type.startswith("ai_") or "ai_respond" in node_type:
        return "bedrock"

    return None


def _get_retry_count(attributes: dict) -> int:
    """Get retry count from message attributes.

    Args:
        attributes: Message attributes.

    Returns:
        Retry count.
    """
    # Check ApproximateReceiveCount (SQS built-in)
    receive_count = attributes.get("ApproximateReceiveCount", {})
    if isinstance(receive_count, dict):
        try:
            return int(receive_count.get("stringValue", "0"))
        except ValueError:
            pass

    # Check custom retry count attribute
    retry_attr = attributes.get("RetryCount", {})
    if isinstance(retry_attr, dict):
        try:
            return int(retry_attr.get("stringValue", "0"))
        except ValueError:
            pass

    return 0


def _calculate_backoff_delay(retry_count: int, base_delay: int) -> int:
    """Calculate exponential backoff delay.

    Args:
        retry_count: Current retry count.
        base_delay: Base delay in seconds.

    Returns:
        Delay in seconds (max 900 for SQS).
    """
    import random

    # Exponential backoff with jitter
    delay = base_delay * (2 ** retry_count)

    # Add jitter (10-20%)
    jitter = delay * random.uniform(0.1, 0.2)
    delay = int(delay + jitter)

    # SQS max delay is 900 seconds (15 minutes)
    return min(delay, 900)


def _retry_message(
    message_data: dict,
    workspace_id: str,
    retry_count: int,
    delay_seconds: int,
) -> bool:
    """Retry a message by sending back to the workflow queue.

    Args:
        message_data: Message data to retry.
        workspace_id: Workspace ID.
        retry_count: Current retry count.
        delay_seconds: Delay before processing.

    Returns:
        True if successfully queued.
    """
    try:
        router = get_workflow_router()

        # Add retry metadata
        message_data["_retry_count"] = retry_count
        message_data["_retried_at"] = datetime.now(timezone.utc).isoformat()

        trigger_type = message_data.get("trigger_type", "unknown")
        contact_id = message_data.get("contact_id")

        message = WorkflowTriggerMessage(
            workspace_id=workspace_id,
            trigger_type=trigger_type,
            trigger_data=message_data,
            contact_id=contact_id,
            delay_seconds=min(delay_seconds, 900),
        )

        result = router.route_trigger(message)

        logger.info(
            "Message requeued",
            workspace_id=workspace_id,
            retry_count=retry_count,
            delay_seconds=delay_seconds,
            success=result.success,
            method=result.method,
        )

        return result.success

    except Exception as e:
        logger.error(
            "Failed to requeue message",
            workspace_id=workspace_id,
            error=str(e),
        )
        return False


def _send_alert(
    workspace_id: str,
    message_data: dict,
    classification: ErrorClassification,
    reason: str,
) -> None:
    """Send alert for permanent failure.

    Args:
        workspace_id: Workspace ID.
        message_data: Original message data.
        classification: Error classification.
        reason: Alert reason.
    """
    logger.warning(
        "Sending permanent failure alert",
        workspace_id=workspace_id,
        error_type=classification.error_type.value,
        reason=reason,
        provider=classification.provider,
        error_code=classification.error_code,
    )

    # Try to send SNS alert if configured
    sns_topic_arn = os.environ.get("DLQ_ALERT_TOPIC_ARN")
    if sns_topic_arn:
        try:
            sns = boto3.client("sns")

            alert_message = {
                "workspace_id": workspace_id,
                "error_type": classification.error_type.value,
                "error_code": classification.error_code,
                "reason": reason,
                "classification_reason": classification.reason,
                "provider": classification.provider,
                "trigger_type": message_data.get("trigger_type"),
                "contact_id": message_data.get("contact_id"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            sns.publish(
                TopicArn=sns_topic_arn,
                Subject=f"Workflow Error: {workspace_id}",
                Message=json.dumps(alert_message, indent=2),
                MessageAttributes={
                    "workspace_id": {
                        "DataType": "String",
                        "StringValue": workspace_id,
                    },
                    "error_type": {
                        "DataType": "String",
                        "StringValue": classification.error_type.value,
                    },
                },
            )

            logger.info(
                "SNS alert sent",
                workspace_id=workspace_id,
                topic_arn=sns_topic_arn,
            )

        except Exception as e:
            logger.error(
                "Failed to send SNS alert",
                workspace_id=workspace_id,
                error=str(e),
            )

    # Also try to store in DynamoDB for dashboard visibility
    _store_failure_record(workspace_id, message_data, classification, reason)


def _store_failure_record(
    workspace_id: str,
    message_data: dict,
    classification: ErrorClassification,
    reason: str,
) -> None:
    """Store failure record in DynamoDB for visibility.

    Args:
        workspace_id: Workspace ID.
        message_data: Original message data.
        classification: Error classification.
        reason: Failure reason.
    """
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        return

    try:
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(table_name)

        from complens.models.base import generate_ulid

        failure_id = f"fail-{generate_ulid()}"
        now = datetime.now(timezone.utc)

        table.put_item(
            Item={
                "PK": f"WS#{workspace_id}",
                "SK": f"DLQ_FAILURE#{failure_id}",
                "GSI1PK": f"WS#{workspace_id}#DLQ_FAILURES",
                "GSI1SK": now.isoformat(),
                "id": failure_id,
                "workspace_id": workspace_id,
                "error_type": classification.error_type.value,
                "error_code": classification.error_code,
                "reason": reason,
                "classification_reason": classification.reason,
                "provider": classification.provider,
                "trigger_type": message_data.get("trigger_type"),
                "contact_id": message_data.get("contact_id"),
                "workflow_id": message_data.get("workflow_id"),
                "message_preview": json.dumps(message_data)[:1000],
                "created_at": now.isoformat(),
                "status": "pending",  # pending, resolved, ignored
                "ttl": int(now.timestamp()) + (30 * 24 * 60 * 60),  # 30 days
            }
        )

        logger.info(
            "Failure record stored",
            workspace_id=workspace_id,
            failure_id=failure_id,
        )

    except Exception as e:
        logger.error(
            "Failed to store failure record",
            workspace_id=workspace_id,
            error=str(e),
        )
