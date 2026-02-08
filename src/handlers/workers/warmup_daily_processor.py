"""Daily warm-up processor Lambda.

Scheduled to run at 00:05 UTC daily. Advances warm-up days,
resets counters, drains deferred emails, and marks completed warm-ups.
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.models.deferred_email import DeferredEmail
from complens.repositories.warmup_domain import WarmupDomainRepository
from complens.services.email_service import EmailService
from complens.services.warmup_service import WarmupService

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process daily warm-up advancement and drain deferred emails.

    Triggered by EventBridge cron schedule (00:05 UTC daily).
    """
    logger.info("Warmup daily processor started")

    repo = WarmupDomainRepository()
    service = WarmupService(repo=repo)

    # Step 1: Advance all active warm-up domains
    active_domains = repo.list_active()
    advanced = 0
    completed = 0

    for warmup in active_domains:
        result = service.advance_day(warmup.domain)
        if result:
            advanced += 1
            if result.status == "completed":
                completed += 1

    logger.info(
        "Warmup days advanced",
        total_active=len(active_domains),
        advanced=advanced,
        completed=completed,
    )

    # Step 2: Drain deferred email queue
    deferred_queue_url = os.environ.get("DEFERRED_EMAIL_QUEUE_URL")
    if deferred_queue_url:
        drained = _drain_deferred_emails(service, deferred_queue_url)
        logger.info("Deferred emails drained", count=drained)
    else:
        logger.info("No deferred email queue configured, skipping drain")
        drained = 0

    return {
        "status": "success",
        "advanced": advanced,
        "completed": completed,
        "deferred_drained": drained,
    }


def _drain_deferred_emails(service: WarmupService, queue_url: str) -> int:
    """Drain deferred emails from SQS, respecting updated daily limits.

    Receives messages in batches, checks each domain's current limit,
    and sends emails that fit within the new daily allowance.
    Messages that still can't be sent are left in the queue.

    Args:
        service: WarmupService instance.
        queue_url: SQS queue URL.

    Returns:
        Number of emails successfully sent.
    """
    sqs = boto3.client("sqs")
    email_service = EmailService()
    sent_count = 0
    max_iterations = 50  # Safety limit

    for _ in range(max_iterations):
        response = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=1,
            VisibilityTimeout=60,
        )

        messages = response.get("Messages", [])
        if not messages:
            break

        for message in messages:
            try:
                deferred = DeferredEmail.model_validate_json(message["Body"])
            except Exception:
                logger.warning(
                    "Invalid deferred email message, deleting",
                    message_id=message.get("MessageId"),
                )
                sqs.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=message["ReceiptHandle"],
                )
                continue

            # Check if this domain now has capacity
            check = service.check_warmup_limit(deferred.from_email)
            if not check.allowed:
                # Still over limit - leave in queue for next day
                logger.debug(
                    "Deferred email still over limit, leaving in queue",
                    domain=deferred.domain,
                )
                continue

            # Send the email (skip warmup check since we just checked)
            try:
                email_service.send_email(
                    to=deferred.to,
                    subject=deferred.subject,
                    body_text=deferred.body_text,
                    body_html=deferred.body_html,
                    from_email=deferred.from_email,
                    reply_to=deferred.reply_to,
                    cc=deferred.cc,
                    bcc=deferred.bcc,
                    tags=deferred.tags,
                    _skip_warmup_check=True,
                )
                sent_count += 1

                sqs.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=message["ReceiptHandle"],
                )
            except Exception:
                logger.warning(
                    "Failed to send deferred email",
                    domain=deferred.domain,
                    to=deferred.to,
                )

    return sent_count
