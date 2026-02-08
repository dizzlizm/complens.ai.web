"""Warmup reply handler Lambda.

Triggered by SES Receipt Rule when inbound email arrives.
Checks if the recipient domain has an active warmup, and if so,
records the reply for engagement metrics.
"""

from typing import Any

import structlog

from complens.repositories.warmup_domain import WarmupDomainRepository
from complens.services.warmup_service import WarmupService

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process SES inbound email events for warmup reply tracking.

    The Lambda receives the SES event with sender/recipient metadata.
    We extract the recipient domain, check if it's a tracked warmup domain,
    and record the reply if so.

    Args:
        event: SES Receipt Rule event.
        context: Lambda context.

    Returns:
        Summary dict with processed count.
    """
    logger.info("Warmup reply handler started")

    repo = WarmupDomainRepository()
    service = WarmupService(repo=repo)

    records = event.get("Records", [])
    processed = 0
    replies_recorded = 0

    for record in records:
        ses_event = record.get("ses", {})
        mail = ses_event.get("mail", {})
        receipt = ses_event.get("receipt", {})

        # Extract recipients from the SES event
        recipients = receipt.get("recipients", [])
        if not recipients:
            logger.debug("No recipients in SES event, skipping")
            continue

        sender = mail.get("source", "")

        for recipient in recipients:
            domain = _extract_domain(recipient)
            if not domain:
                continue

            # Check if this domain has an active warmup
            warmup = service.get_status(domain)
            if not warmup or not warmup.is_active:
                logger.debug(
                    "Recipient domain not in active warmup, skipping",
                    domain=domain,
                    recipient=recipient,
                )
                continue

            # Record the reply
            service.record_reply(domain)
            replies_recorded += 1

            logger.info(
                "Warmup reply recorded",
                domain=domain,
                sender=sender,
                recipient=recipient,
            )

        processed += 1

    logger.info(
        "Warmup reply handler completed",
        records_processed=processed,
        replies_recorded=replies_recorded,
    )

    return {
        "status": "success",
        "processed": processed,
        "replies_recorded": replies_recorded,
    }


def _extract_domain(email: str) -> str | None:
    """Extract domain from an email address.

    Args:
        email: Email address.

    Returns:
        Domain string, or None if invalid.
    """
    if "@" not in email:
        return None
    return email.rsplit("@", 1)[1].lower()
