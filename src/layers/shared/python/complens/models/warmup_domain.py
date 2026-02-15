"""Warmup domain model for email domain warm-up tracking."""

from datetime import datetime
from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, EmailStr, Field, field_validator, model_validator

from complens.models.base import BaseModel


# Default warm-up schedule: daily sending limits over 42 days (6 weeks)
# Industry best practice: start low (10-20/day), ramp gradually over 6 weeks
DEFAULT_WARMUP_SCHEDULE = [
    # Week 1: 10-50/day
    10, 15, 20, 25, 35, 45, 50,
    # Week 2: 65-200/day
    65, 80, 100, 120, 150, 175, 200,
    # Week 3: 250-750/day
    250, 300, 350, 400, 500, 600, 750,
    # Week 4: 900-2500/day
    900, 1000, 1200, 1500, 1800, 2000, 2500,
    # Week 5: 3000-6000/day
    3000, 3500, 4000, 4500, 5000, 5500, 6000,
    # Week 6: 6500-10000/day
    6500, 7000, 7500, 8000, 8500, 9000, 10000,
]


def generate_schedule(
    target_daily_volume: int,
    days: int = 42,
    start_volume: int = 10,
) -> list[int]:
    """Generate a warmup schedule that ramps to the target volume.

    Uses geometric progression over the given number of days so the ramp
    curve feels natural (slow start, accelerating growth).

    Args:
        target_daily_volume: Final daily sending volume to reach.
        days: Number of warmup days (default 42 = 6 weeks).
        start_volume: Starting daily volume (default 10).

    Returns:
        List of daily sending limits.
    """
    import math

    start = max(1, start_volume)
    if target_daily_volume <= start:
        return [target_daily_volume] * days

    # Geometric ratio: start * ratio^(days-1) = target
    ratio = (target_daily_volume / start) ** (1.0 / (days - 1))

    schedule = []
    for day in range(days):
        value = int(round(start * (ratio ** day)))
        value = min(value, target_daily_volume)
        schedule.append(value)

    # Ensure final day hits target exactly
    schedule[-1] = target_daily_volume
    return schedule


class WarmupStatus(str, Enum):
    """Warm-up domain status."""

    PENDING = "pending"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WarmupDomain(BaseModel):
    """Email domain warm-up entity.

    Tracks the warm-up state for a sending domain, including current day,
    schedule, and reputation metrics.

    Key Pattern:
        PK: WARMUP#{domain}
        SK: META
        GSI1PK: WS#{workspace_id}#WARMUPS
        GSI1SK: {status}#{domain}
    """

    _pk_prefix: ClassVar[str] = "WARMUP#"
    _sk_prefix: ClassVar[str] = "META"

    workspace_id: str = Field(..., description="Owning workspace ID")
    site_id: str | None = Field(None, description="Site this warmup belongs to (resolved from DomainSetup)")
    domain: str = Field(..., min_length=1, max_length=253, description="Email sending domain")
    status: WarmupStatus = Field(default=WarmupStatus.PENDING, description="Warm-up status")
    warmup_day: int = Field(default=0, description="Current warm-up day (0-indexed)")
    schedule: list[int] = Field(
        default_factory=lambda: list(DEFAULT_WARMUP_SCHEDULE),
        description="Daily sending limits",
    )
    started_at: str | None = Field(None, description="ISO timestamp when warm-up was started")
    pause_reason: str | None = Field(None, description="Reason for pause (if paused)")

    # Reputation metrics (cumulative)
    total_sent: int = Field(default=0, description="Total emails sent during warm-up")
    total_bounced: int = Field(default=0, description="Total bounces during warm-up")
    total_complaints: int = Field(default=0, description="Total complaints during warm-up")
    bounce_rate: float = Field(default=0.0, description="Current bounce rate percentage")
    complaint_rate: float = Field(default=0.0, description="Current complaint rate percentage")

    # Engagement metrics (cumulative)
    total_delivered: int = Field(default=0, description="Total emails delivered during warm-up")
    total_opens: int = Field(default=0, description="Total opens during warm-up")
    open_rate: float = Field(default=0.0, description="Open rate percentage (opens/delivered)")

    # AI warmup settings
    seed_list: list[str] = Field(default_factory=list, description="Email addresses for warmup sending")
    auto_warmup_enabled: bool = Field(default=False, description="Toggle for automatic warmup sending")
    from_name: str | None = Field(None, max_length=100, description="Display name for warmup from-address")
    from_email_local: str | None = Field(
        None, max_length=64,
        pattern=r"^[a-zA-Z0-9._%+\-]+$",
        description="Local part of from-address (e.g. 'hello' for hello@domain.com)",
    )
    from_email_verified: bool = Field(default=False, description="Whether from_email_local has been verified")
    from_email_verify_code: str | None = Field(None, description="Pending verification code")

    # Reply-to mailbox verification
    reply_to: str | None = Field(None, description="Reply-to email address for warmup emails")
    reply_to_verified: bool = Field(default=False, description="Whether reply_to mailbox has been verified")
    reply_to_verify_token: str | None = Field(None, description="Verification token, cleared after use")

    # Campaign preferences
    preferred_tones: list[str] = Field(default_factory=list, description="Preferred email tones (e.g. professional, friendly)")
    preferred_content_types: list[str] = Field(default_factory=list, description="Preferred content types (e.g. newsletter, product_update)")
    email_length: str = Field(default="medium", description="Email length preference: short, medium, or long")
    target_daily_volume: int = Field(default=500, description="Target daily sending volume at end of warmup")

    # Send window (UTC hours)
    send_window_start: int = Field(default=9, ge=0, le=23, description="Send window start hour (UTC)")
    send_window_end: int = Field(default=19, ge=0, le=23, description="Send window end hour (UTC)")

    # Engagement warning
    low_engagement_warning: bool = Field(default=False, description="True if open rate < 5% after day 7")

    # Thresholds for auto-pause
    max_bounce_rate: float = Field(default=5.0, description="Max bounce rate before auto-pause (%)")
    max_complaint_rate: float = Field(default=0.1, description="Max complaint rate before auto-pause (%)")

    # Cached domain health check
    health_check_result: dict | None = Field(None, description="Cached domain health check JSON")
    health_check_at: str | None = Field(None, description="ISO timestamp of last health check")

    @field_validator("started_at", "health_check_at", mode="before")
    @classmethod
    def coerce_datetime_to_str(cls, v: datetime | str | None) -> str | None:
        """Coerce datetime objects to ISO strings for consistent storage."""
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @property
    def daily_limit(self) -> int:
        """Get current daily sending limit based on schedule and warmup_day.

        Returns:
            Current daily limit, or -1 if warm-up is complete.
        """
        if self.warmup_day >= len(self.schedule):
            return -1  # No limit (warm-up complete)
        return self.schedule[self.warmup_day]

    @property
    def is_active(self) -> bool:
        """Check if warm-up is actively enforcing limits."""
        return self.status == WarmupStatus.ACTIVE

    def get_pk(self) -> str:
        """Get partition key: WARMUP#{domain}."""
        return f"WARMUP#{self.domain}"

    def get_sk(self) -> str:
        """Get sort key: META."""
        return "META"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing warm-ups by workspace."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#WARMUPS",
            "GSI1SK": f"{self.status}#{self.domain}",
        }

    def get_gsi4_keys(self) -> dict[str, str] | None:
        """Get GSI4 keys for global active warmup listing.

        Only active domains get GSI4 keys. When status changes away from active,
        a full put_item without GSI4 keys removes the item from the index.
        """
        if self.status == WarmupStatus.ACTIVE or self.status == "active":
            return {
                "GSI4PK": "WARMUP_ACTIVE",
                "GSI4SK": self.domain,
            }
        return None


class VerifyReplyToRequest(PydanticBaseModel):
    """Request model for verifying a reply-to mailbox."""

    reply_to: str = Field(..., description="Reply-to email address to verify")

    @field_validator("reply_to")
    @classmethod
    def validate_reply_to(cls, v: str) -> str:
        """Validate reply-to email format."""
        v = v.strip().lower()
        if "@" not in v or "." not in v:
            raise ValueError("reply_to must be a valid email address")
        return v


class StartWarmupRequest(PydanticBaseModel):
    """Request model for starting a domain warm-up."""

    domain: str = Field(..., min_length=1, max_length=253, description="Domain to warm up")
    schedule: list[int] | None = Field(
        None,
        description="Custom schedule (daily limits). Defaults to 42-day ramp.",
    )
    max_bounce_rate: float = Field(default=5.0, ge=0.1, le=50.0)
    max_complaint_rate: float = Field(default=0.1, ge=0.01, le=5.0)
    send_window_start: int = Field(default=9, ge=0, le=23, description="Send window start hour (UTC)")
    send_window_end: int = Field(default=19, ge=0, le=23, description="Send window end hour (UTC)")
    seed_list: list[str] = Field(default_factory=list, max_length=50, description="Seed email addresses")
    auto_warmup_enabled: bool = Field(default=False, description="Enable automatic warmup sending")
    from_name: str | None = Field(None, max_length=100, description="Display name for warmup from-address")
    from_email_local: str | None = Field(
        None, max_length=64, pattern=r"^[a-zA-Z0-9._%+\-]+$",
        description="Local part of from-address (e.g. 'marketing')",
    )
    reply_to: str | None = Field(None, description="Reply-to email address (must be verified before start)")
    preferred_tones: list[str] | None = None
    preferred_content_types: list[str] | None = None
    email_length: str | None = None
    target_daily_volume: int | None = Field(None, ge=50, le=10000)
    warmup_days: int | None = Field(None, ge=7, le=90, description="Ramp-up duration in days")
    start_volume: int | None = Field(None, ge=1, le=500, description="Starting daily volume")
    site_id: str | None = Field(None, description="Site this warmup belongs to")

    @model_validator(mode="after")
    def validate_send_window(self) -> "StartWarmupRequest":
        """Ensure send window has at least 1 hour."""
        if self.send_window_start == self.send_window_end:
            raise ValueError("Send window start and end must differ (need at least 1 hour)")
        return self


class UpdateSeedListRequest(PydanticBaseModel):
    """Request model for updating seed list configuration."""

    seed_list: list[str] = Field(..., max_length=50, description="Seed email addresses (1-50)")
    auto_warmup_enabled: bool = Field(default=True, description="Enable automatic warmup sending")
    from_name: str | None = Field(None, max_length=100, description="Display name for warmup from-address")
    from_email_local: str | None = Field(
        None, max_length=64, pattern=r"^[a-zA-Z0-9._%+\-]+$",
        description="Local part of from-address (e.g. 'marketing')",
    )

    @field_validator("seed_list")
    @classmethod
    def validate_seed_list(cls, v: list[str]) -> list[str]:
        """Validate seed list emails are non-empty."""
        if not v:
            raise ValueError("seed_list must contain at least 1 email address")
        return v


class UpdateWarmupSettingsRequest(PydanticBaseModel):
    """Request model for updating warmup settings (schedule, thresholds, send window)."""

    send_window_start: int | None = Field(None, ge=0, le=23)
    send_window_end: int | None = Field(None, ge=0, le=23)
    max_bounce_rate: float | None = Field(None, ge=0.1, le=50.0)
    max_complaint_rate: float | None = Field(None, ge=0.01, le=5.0)
    schedule: list[int] | None = Field(None, description="Remaining schedule from current day onward")
    preferred_tones: list[str] | None = None
    preferred_content_types: list[str] | None = None
    email_length: str | None = None

    @model_validator(mode="after")
    def validate_send_window(self) -> "UpdateWarmupSettingsRequest":
        """Ensure send window has at least 1 hour when both are provided."""
        if self.send_window_start is not None and self.send_window_end is not None:
            if self.send_window_start == self.send_window_end:
                raise ValueError("Send window start and end must differ (need at least 1 hour)")
        return self


class WarmupStatusResponse(PydanticBaseModel):
    """Response model for warm-up domain status."""

    domain: str
    site_id: str | None = None
    status: str
    warmup_day: int
    daily_limit: int
    schedule_length: int
    schedule: list[int] = Field(default_factory=list)
    total_sent: int
    total_bounced: int
    total_complaints: int
    bounce_rate: float
    complaint_rate: float
    total_delivered: int = 0
    total_opens: int = 0
    open_rate: float = 0.0
    send_window_start: int = 9
    send_window_end: int = 19
    low_engagement_warning: bool = False
    max_bounce_rate: float
    max_complaint_rate: float
    started_at: datetime | str | None = None
    pause_reason: str | None = None
    seed_list: list[str] = []
    auto_warmup_enabled: bool = False
    from_name: str | None = None
    from_email_local: str | None = None
    from_email_verified: bool = False
    reply_to: str | None = None
    reply_to_verified: bool = False
    preferred_tones: list[str] = Field(default_factory=list)
    preferred_content_types: list[str] = Field(default_factory=list)
    email_length: str = "medium"
    target_daily_volume: int = 500

    @classmethod
    def from_warmup_domain(cls, wd: "WarmupDomain") -> "WarmupStatusResponse":
        """Create response from a WarmupDomain model.

        Args:
            wd: WarmupDomain instance.

        Returns:
            WarmupStatusResponse with computed fields.
        """
        return cls(
            domain=wd.domain,
            site_id=wd.site_id,
            status=wd.status,
            warmup_day=wd.warmup_day,
            daily_limit=wd.daily_limit,
            schedule_length=len(wd.schedule),
            schedule=wd.schedule,
            total_sent=wd.total_sent,
            total_bounced=wd.total_bounced,
            total_complaints=wd.total_complaints,
            bounce_rate=wd.bounce_rate,
            complaint_rate=wd.complaint_rate,
            total_delivered=wd.total_delivered,
            total_opens=wd.total_opens,
            open_rate=wd.open_rate,
            send_window_start=wd.send_window_start,
            send_window_end=wd.send_window_end,
            low_engagement_warning=wd.low_engagement_warning,
            max_bounce_rate=wd.max_bounce_rate,
            max_complaint_rate=wd.max_complaint_rate,
            started_at=wd.started_at,
            pause_reason=wd.pause_reason,
            seed_list=wd.seed_list,
            auto_warmup_enabled=wd.auto_warmup_enabled,
            from_name=wd.from_name,
            from_email_local=wd.from_email_local,
            from_email_verified=wd.from_email_verified,
            reply_to=wd.reply_to,
            reply_to_verified=wd.reply_to_verified,
            preferred_tones=wd.preferred_tones,
            preferred_content_types=wd.preferred_content_types,
            email_length=wd.email_length,
            target_daily_volume=wd.target_daily_volume,
        )


class DomainHealthResponse(PydanticBaseModel):
    """Response model for domain health check."""

    domain: str
    score: int = Field(..., ge=0, le=100, description="Health score 0-100")
    status: str = Field(..., description="good, warning, or critical")

    # Authentication
    spf_valid: bool = False
    spf_record: str | None = None
    dkim_enabled: bool = False
    dmarc_valid: bool = False
    dmarc_record: str | None = None
    dmarc_policy: str | None = None

    # Infrastructure
    mx_valid: bool = False
    mx_hosts: list[str] = Field(default_factory=list)

    # Blacklist
    blacklisted: bool = False
    blacklist_listings: list[str] = Field(default_factory=list)

    # Engagement
    bounce_rate: float = 0.0
    complaint_rate: float = 0.0
    open_rate: float = 0.0

    # Metadata
    score_breakdown: dict[str, int] = Field(default_factory=dict)
    checked_at: datetime | str | None = None
    cached: bool = False
    errors: list[str] = Field(default_factory=list)
