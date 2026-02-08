"""Email domain warm-up service.

Manages gradual ramp-up of sending volume for new email domains.
Intercepts outbound email at the EmailService layer and enforces daily limits.
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone

import boto3
import structlog
from botocore.exceptions import ClientError

from complens.models.deferred_email import DeferredEmail
from complens.models.warmup_domain import (
    DEFAULT_WARMUP_SCHEDULE,
    WarmupDomain,
    WarmupStatus,
)
from complens.repositories.warmup_domain import WarmupDomainRepository

logger = structlog.get_logger()


@dataclass
class WarmupCheckResult:
    """Result of checking warm-up limits for an outbound email."""

    allowed: bool
    should_defer: bool
    domain: str | None = None
    remaining: int | None = None
    daily_limit: int | None = None


class WarmupService:
    """Service for managing email domain warm-up.

    Provides the hot-path check (called from EmailService) and warm-up
    lifecycle management (start, pause, resume, cancel).
    """

    def __init__(
        self,
        repo: WarmupDomainRepository | None = None,
        deferred_queue_url: str | None = None,
    ):
        """Initialize warm-up service.

        Args:
            repo: Optional WarmupDomainRepository (created lazily if not provided).
            deferred_queue_url: SQS queue URL for deferred emails.
        """
        self._repo = repo
        self._deferred_queue_url = deferred_queue_url or os.environ.get("DEFERRED_EMAIL_QUEUE_URL")
        self._sqs = None

    @property
    def repo(self) -> WarmupDomainRepository:
        """Get warm-up domain repository (lazy init)."""
        if self._repo is None:
            self._repo = WarmupDomainRepository()
        return self._repo

    @property
    def sqs(self):
        """Get SQS client (lazy init)."""
        if self._sqs is None:
            self._sqs = boto3.client("sqs")
        return self._sqs

    # -------------------------------------------------------------------------
    # Hot path: called from EmailService on every send
    # -------------------------------------------------------------------------

    def check_warmup_limit(self, from_email: str) -> WarmupCheckResult:
        """Check if an outbound email is within warm-up limits.

        This is the hot-path method called from EmailService.send_email().
        Fails open on errors (allows sending if DynamoDB is unreachable).

        Args:
            from_email: Sender email address.

        Returns:
            WarmupCheckResult indicating whether to send, defer, or pass through.
        """
        domain = self._extract_domain(from_email)
        if not domain:
            return WarmupCheckResult(allowed=True, should_defer=False)

        try:
            warmup = self.repo.get_by_domain(domain)
        except Exception:
            logger.warning("Warmup lookup failed, failing open", domain=domain)
            return WarmupCheckResult(allowed=True, should_defer=False)

        if not warmup or warmup.status != WarmupStatus.ACTIVE:
            return WarmupCheckResult(allowed=True, should_defer=False)

        daily_limit = warmup.daily_limit
        if daily_limit == -1:
            # Warm-up schedule complete, no limit
            return WarmupCheckResult(allowed=True, should_defer=False, domain=domain)

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        try:
            new_count = self.repo.increment_daily_send(domain, today, daily_limit)
        except Exception:
            logger.warning("Warmup counter increment failed, failing open", domain=domain)
            return WarmupCheckResult(allowed=True, should_defer=False)

        if new_count <= daily_limit:
            remaining = daily_limit - new_count
            return WarmupCheckResult(
                allowed=True,
                should_defer=False,
                domain=domain,
                remaining=remaining,
                daily_limit=daily_limit,
            )

        # Over daily limit - should defer
        return WarmupCheckResult(
            allowed=False,
            should_defer=True,
            domain=domain,
            remaining=0,
            daily_limit=daily_limit,
        )

    def defer_email(
        self,
        to: list[str],
        subject: str,
        body_text: str | None,
        body_html: str | None,
        from_email: str,
        reply_to: list[str] | None,
        cc: list[str] | None,
        bcc: list[str] | None,
        tags: dict[str, str] | None,
        domain: str,
    ) -> dict:
        """Queue an email for later sending.

        Args:
            to: Recipient addresses.
            subject: Email subject.
            body_text: Plain text body.
            body_html: HTML body.
            from_email: Sender email.
            reply_to: Reply-to addresses.
            cc: CC addresses.
            bcc: BCC addresses.
            tags: Message tags.
            domain: Sending domain.

        Returns:
            Dict with status and message_id.
        """
        if not self._deferred_queue_url:
            logger.warning("No deferred email queue configured, cannot defer")
            return {"status": "send_failed", "reason": "no_queue_configured"}

        deferred = DeferredEmail(
            to=to,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            from_email=from_email,
            reply_to=reply_to,
            cc=cc,
            bcc=bcc,
            tags=tags,
            domain=domain,
        )

        try:
            response = self.sqs.send_message(
                QueueUrl=self._deferred_queue_url,
                MessageBody=deferred.model_dump_json(),
                MessageAttributes={
                    "domain": {"StringValue": domain, "DataType": "String"},
                },
            )
            logger.info(
                "Email deferred to queue",
                domain=domain,
                to=to,
                message_id=response.get("MessageId"),
            )
            return {"status": "deferred", "message_id": response.get("MessageId")}
        except ClientError as e:
            logger.error("Failed to defer email", domain=domain, error=str(e))
            return {"status": "defer_failed", "reason": str(e)}

    # -------------------------------------------------------------------------
    # Lifecycle management
    # -------------------------------------------------------------------------

    def start_warmup(
        self,
        workspace_id: str,
        domain: str,
        schedule: list[int] | None = None,
        max_bounce_rate: float = 5.0,
        max_complaint_rate: float = 0.1,
    ) -> WarmupDomain:
        """Start a warm-up for a domain.

        Args:
            workspace_id: Workspace ID.
            domain: Email sending domain.
            schedule: Custom warm-up schedule (daily limits).
            max_bounce_rate: Auto-pause bounce rate threshold.
            max_complaint_rate: Auto-pause complaint rate threshold.

        Returns:
            Created WarmupDomain.

        Raises:
            ConflictError: If warm-up already exists for this domain.
        """
        warmup = WarmupDomain(
            workspace_id=workspace_id,
            domain=domain,
            status=WarmupStatus.ACTIVE,
            warmup_day=0,
            schedule=schedule or list(DEFAULT_WARMUP_SCHEDULE),
            started_at=datetime.now(timezone.utc).isoformat(),
            max_bounce_rate=max_bounce_rate,
            max_complaint_rate=max_complaint_rate,
        )

        warmup = self.repo.create_warmup(warmup)

        logger.info(
            "Warmup started",
            domain=domain,
            workspace_id=workspace_id,
            schedule_length=len(warmup.schedule),
            daily_limit=warmup.daily_limit,
        )

        return warmup

    def pause_warmup(self, domain: str, reason: str = "manual") -> WarmupDomain:
        """Pause a warm-up.

        Args:
            domain: Email sending domain.
            reason: Reason for pausing.

        Returns:
            Updated WarmupDomain.

        Raises:
            NotFoundError: If warm-up not found.
        """
        warmup = self.repo.get_by_domain(domain)
        if not warmup:
            from complens.utils.exceptions import NotFoundError
            raise NotFoundError("warmup_domain", domain)

        warmup.status = WarmupStatus.PAUSED
        warmup.pause_reason = reason
        warmup = self.repo.update_warmup(warmup)

        logger.info("Warmup paused", domain=domain, reason=reason)
        return warmup

    def resume_warmup(self, domain: str) -> WarmupDomain:
        """Resume a paused warm-up.

        Args:
            domain: Email sending domain.

        Returns:
            Updated WarmupDomain.

        Raises:
            NotFoundError: If warm-up not found.
            ValidationError: If warm-up is not in paused state.
        """
        warmup = self.repo.get_by_domain(domain)
        if not warmup:
            from complens.utils.exceptions import NotFoundError
            raise NotFoundError("warmup_domain", domain)

        if warmup.status != WarmupStatus.PAUSED:
            from complens.utils.exceptions import ValidationError
            raise ValidationError(
                f"Cannot resume warmup in '{warmup.status}' state",
                errors=[{"field": "status", "msg": f"Expected 'paused', got '{warmup.status}'"}],
            )

        warmup.status = WarmupStatus.ACTIVE
        warmup.pause_reason = None
        warmup = self.repo.update_warmup(warmup)

        logger.info("Warmup resumed", domain=domain)
        return warmup

    def cancel_warmup(self, domain: str) -> bool:
        """Cancel and delete a warm-up.

        Args:
            domain: Email sending domain.

        Returns:
            True if deleted.
        """
        deleted = self.repo.delete_warmup(domain)
        if deleted:
            logger.info("Warmup cancelled", domain=domain)
        return deleted

    def get_status(self, domain: str) -> WarmupDomain | None:
        """Get warm-up status for a domain.

        Args:
            domain: Email sending domain.

        Returns:
            WarmupDomain or None.
        """
        return self.repo.get_by_domain(domain)

    # -------------------------------------------------------------------------
    # Daily advancement (called by scheduled processor)
    # -------------------------------------------------------------------------

    def advance_day(self, domain: str) -> WarmupDomain | None:
        """Advance the warm-up day for a domain.

        Called by the daily processor. Advances warmup_day, updates
        reputation metrics from previous day's counters, and marks
        complete if past the schedule length.

        Args:
            domain: Email sending domain.

        Returns:
            Updated WarmupDomain, or None if not found/not active.
        """
        warmup = self.repo.get_by_domain(domain)
        if not warmup or warmup.status != WarmupStatus.ACTIVE:
            return None

        # Get yesterday's counter for reputation metrics
        yesterday = self._yesterday_str()
        counter = self.repo.get_daily_counter(domain, yesterday)
        if counter:
            warmup.total_sent += counter["send_count"]
            warmup.total_bounced += counter["bounce_count"]
            warmup.total_complaints += counter["complaint_count"]
            warmup.bounce_rate = self._calc_rate(warmup.total_bounced, warmup.total_sent)
            warmup.complaint_rate = self._calc_rate(warmup.total_complaints, warmup.total_sent)

        warmup.warmup_day += 1

        if warmup.warmup_day >= len(warmup.schedule):
            warmup.status = WarmupStatus.COMPLETED
            logger.info("Warmup completed", domain=domain, total_sent=warmup.total_sent)
        else:
            logger.info(
                "Warmup day advanced",
                domain=domain,
                warmup_day=warmup.warmup_day,
                new_daily_limit=warmup.daily_limit,
            )

        warmup = self.repo.update_warmup(warmup)
        return warmup

    # -------------------------------------------------------------------------
    # Bounce/complaint tracking
    # -------------------------------------------------------------------------

    def record_bounce(self, domain: str) -> bool:
        """Record a bounce event and check thresholds.

        Args:
            domain: Email sending domain.

        Returns:
            True if auto-paused due to threshold breach.
        """
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        try:
            self.repo.increment_daily_bounce(domain, today)
        except Exception:
            logger.warning("Failed to increment bounce counter", domain=domain)
            return False

        return self._check_thresholds(domain)

    def record_complaint(self, domain: str) -> bool:
        """Record a complaint event and check thresholds.

        Args:
            domain: Email sending domain.

        Returns:
            True if auto-paused due to threshold breach.
        """
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        try:
            self.repo.increment_daily_complaint(domain, today)
        except Exception:
            logger.warning("Failed to increment complaint counter", domain=domain)
            return False

        return self._check_thresholds(domain)

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    def _check_thresholds(self, domain: str) -> bool:
        """Check if bounce/complaint rates exceed thresholds and auto-pause.

        Args:
            domain: Email sending domain.

        Returns:
            True if auto-paused.
        """
        warmup = self.repo.get_by_domain(domain)
        if not warmup or warmup.status != WarmupStatus.ACTIVE:
            return False

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        counter = self.repo.get_daily_counter(domain, today)
        if not counter or counter["send_count"] == 0:
            return False

        # Calculate today's rates
        send_count = counter["send_count"]
        bounce_rate = self._calc_rate(counter["bounce_count"], send_count)
        complaint_rate = self._calc_rate(counter["complaint_count"], send_count)

        # Check thresholds (only meaningful with a minimum sample size)
        if send_count < 10:
            return False

        auto_paused = False
        reason_parts = []

        if bounce_rate > warmup.max_bounce_rate:
            reason_parts.append(f"bounce_rate={bounce_rate:.2f}% > {warmup.max_bounce_rate}%")
            auto_paused = True

        if complaint_rate > warmup.max_complaint_rate:
            reason_parts.append(f"complaint_rate={complaint_rate:.4f}% > {warmup.max_complaint_rate}%")
            auto_paused = True

        if auto_paused:
            reason = f"auto-pause: {', '.join(reason_parts)}"
            logger.warning(
                "Warmup auto-paused due to reputation threshold breach",
                domain=domain,
                bounce_rate=bounce_rate,
                complaint_rate=complaint_rate,
                send_count=send_count,
            )
            self.pause_warmup(domain, reason=reason)

        return auto_paused

    @staticmethod
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

    @staticmethod
    def _calc_rate(numerator: int, denominator: int) -> float:
        """Calculate a percentage rate safely.

        Args:
            numerator: Numerator count.
            denominator: Denominator count.

        Returns:
            Rate as percentage (0-100).
        """
        if denominator == 0:
            return 0.0
        return round((numerator / denominator) * 100, 4)

    @staticmethod
    def _yesterday_str() -> str:
        """Get yesterday's date as YYYY-MM-DD string."""
        from datetime import timedelta
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        return yesterday.strftime("%Y-%m-%d")


def get_warmup_service() -> WarmupService:
    """Factory function for WarmupService.

    Returns:
        Configured WarmupService instance.
    """
    return WarmupService()
