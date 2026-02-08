"""Warmup domain model for email domain warm-up tracking."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


# Default warm-up schedule: daily sending limits over 14 days
DEFAULT_WARMUP_SCHEDULE = [50, 100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 4000, 5500, 7500, 10000]


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

    # Thresholds for auto-pause
    max_bounce_rate: float = Field(default=5.0, description="Max bounce rate before auto-pause (%)")
    max_complaint_rate: float = Field(default=0.1, description="Max complaint rate before auto-pause (%)")

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


class StartWarmupRequest(PydanticBaseModel):
    """Request model for starting a domain warm-up."""

    domain: str = Field(..., min_length=1, max_length=253, description="Domain to warm up")
    schedule: list[int] | None = Field(
        None,
        description="Custom schedule (daily limits). Defaults to 14-day ramp.",
    )
    max_bounce_rate: float = Field(default=5.0, ge=0.1, le=50.0)
    max_complaint_rate: float = Field(default=0.1, ge=0.01, le=5.0)


class WarmupStatusResponse(PydanticBaseModel):
    """Response model for warm-up domain status."""

    domain: str
    status: str
    warmup_day: int
    daily_limit: int
    schedule_length: int
    total_sent: int
    total_bounced: int
    total_complaints: int
    bounce_rate: float
    complaint_rate: float
    max_bounce_rate: float
    max_complaint_rate: float
    started_at: str | None = None
    pause_reason: str | None = None

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
            status=wd.status,
            warmup_day=wd.warmup_day,
            daily_limit=wd.daily_limit,
            schedule_length=len(wd.schedule),
            total_sent=wd.total_sent,
            total_bounced=wd.total_bounced,
            total_complaints=wd.total_complaints,
            bounce_rate=wd.bounce_rate,
            complaint_rate=wd.complaint_rate,
            max_bounce_rate=wd.max_bounce_rate,
            max_complaint_rate=wd.max_complaint_rate,
            started_at=wd.started_at,
            pause_reason=wd.pause_reason,
        )
