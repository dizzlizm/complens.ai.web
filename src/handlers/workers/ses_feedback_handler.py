"""SES bounce/complaint/engagement feedback handler.

Processes SES feedback notifications (bounces, complaints, deliveries,
opens, and clicks) delivered via SNS topic. Updates warm-up daily counters
and auto-pauses domains that exceed reputation thresholds.
"""

import json
from typing import Any

import structlog

from complens.services.warmup_service import WarmupService

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process SES notifications from SNS.

    SNS delivers messages as a batch of records.
    Each record contains an SES notification.
    Supports both standard SES notifications (notificationType) and
    SES Configuration Set event format (eventType).
    """
    service = WarmupService()
    processed = 0
    auto_paused = 0

    for record in event.get("Records", []):
        try:
            sns_message = json.loads(record.get("Sns", {}).get("Message", "{}"))
        except (json.JSONDecodeError, TypeError):
            logger.warning("Invalid SNS message format", record_id=record.get("EventSubscriptionArn"))
            continue

        # Support both standard SES notifications and Configuration Set events
        notification_type = sns_message.get("notificationType") or sns_message.get("eventType")

        if notification_type == "Bounce":
            result = _process_bounce(service, sns_message)
        elif notification_type == "Complaint":
            result = _process_complaint(service, sns_message)
        elif notification_type == "Delivery":
            _process_delivery(service, sns_message)
            result = False
        elif notification_type == "Open":
            _process_open(service, sns_message)
            result = False
        elif notification_type == "Click":
            _process_click(service, sns_message)
            result = False
        elif notification_type == "Send":
            # Send events are informational; daily send counter is already incremented at send time
            result = False
        else:
            logger.debug("Ignoring notification type", notification_type=notification_type)
            continue

        processed += 1
        if result:
            auto_paused += 1

    logger.info(
        "SES feedback processed",
        total_records=len(event.get("Records", [])),
        processed=processed,
        auto_paused=auto_paused,
    )

    return {"processed": processed, "auto_paused": auto_paused}


def _process_bounce(service: WarmupService, notification: dict) -> bool:
    """Process a bounce notification.

    Args:
        service: WarmupService instance.
        notification: SES bounce notification.

    Returns:
        True if domain was auto-paused.
    """
    bounce = notification.get("bounce", {})
    source = notification.get("mail", {}).get("source", "")
    domain = _extract_domain(source)

    if not domain:
        return False

    bounce_type = bounce.get("bounceType", "")
    recipients = [r.get("emailAddress", "") for r in bounce.get("bouncedRecipients", [])]

    logger.info(
        "Processing bounce",
        domain=domain,
        bounce_type=bounce_type,
        recipients=recipients,
    )

    return service.record_bounce(domain)


def _process_complaint(service: WarmupService, notification: dict) -> bool:
    """Process a complaint notification.

    Args:
        service: WarmupService instance.
        notification: SES complaint notification.

    Returns:
        True if domain was auto-paused.
    """
    complaint = notification.get("complaint", {})
    source = notification.get("mail", {}).get("source", "")
    domain = _extract_domain(source)

    if not domain:
        return False

    feedback_type = complaint.get("complaintFeedbackType", "")
    recipients = [r.get("emailAddress", "") for r in complaint.get("complainedRecipients", [])]

    logger.info(
        "Processing complaint",
        domain=domain,
        feedback_type=feedback_type,
        recipients=recipients,
    )

    return service.record_complaint(domain)


def _process_delivery(service: WarmupService, notification: dict) -> None:
    """Process a delivery notification.

    Args:
        service: WarmupService instance.
        notification: SES delivery notification.
    """
    source = notification.get("mail", {}).get("source", "")
    domain = _extract_domain(source)
    if not domain:
        return

    logger.debug("Processing delivery", domain=domain)
    service.record_delivery(domain)


def _process_open(service: WarmupService, notification: dict) -> None:
    """Process an open notification.

    Args:
        service: WarmupService instance.
        notification: SES open notification.
    """
    source = notification.get("mail", {}).get("source", "")
    domain = _extract_domain(source)
    if not domain:
        return

    logger.debug("Processing open", domain=domain)
    service.record_open(domain)


def _process_click(service: WarmupService, notification: dict) -> None:
    """Process a click notification.

    Args:
        service: WarmupService instance.
        notification: SES click notification.
    """
    source = notification.get("mail", {}).get("source", "")
    domain = _extract_domain(source)
    if not domain:
        return

    logger.debug("Processing click", domain=domain)
    service.record_click(domain)


def _extract_domain(email: str) -> str | None:
    """Extract domain from an email address.

    Handles both plain addresses and RFC 5322 display name format
    (e.g. "Display Name <user@domain.com>").

    Args:
        email: Email address (plain or with display name).

    Returns:
        Domain string, or None if invalid.
    """
    from email.utils import parseaddr

    _, addr = parseaddr(email)
    if not addr or "@" not in addr:
        return None
    return addr.rsplit("@", 1)[1].lower()
