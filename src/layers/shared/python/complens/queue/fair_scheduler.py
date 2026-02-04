"""Fair scheduler for multi-tenant workflow processing.

Implements weighted round-robin scheduling with per-tenant credits to ensure
fair resource allocation across workspaces. Prevents any single tenant from
monopolizing queue processing while allowing premium tiers higher throughput.

Credit System:
- Each tenant starts with credits based on their tier
- Processing a message costs 1 credit
- Credits refresh periodically (e.g., every minute)
- Tenants with depleted credits are deprioritized
"""

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()


class TenantTier(str, Enum):
    """Tenant subscription tiers with different credit allocations."""

    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


# Credit allocations per tier (credits per refresh window)
TIER_CREDITS: dict[TenantTier, int] = {
    TenantTier.FREE: 10,
    TenantTier.STARTER: 50,
    TenantTier.PROFESSIONAL: 200,
    TenantTier.ENTERPRISE: 1000,
}

# Credit weights for different priorities
PRIORITY_WEIGHTS: dict[str, int] = {
    "high": 0,      # High priority costs nothing extra
    "normal": 1,    # Normal messages cost 1 credit
    "low": 2,       # Low priority costs more to discourage overuse
}

# Default refresh interval in seconds
DEFAULT_REFRESH_INTERVAL = 60


@dataclass
class TenantCredits:
    """Credit tracking for a tenant."""

    workspace_id: str
    tier: TenantTier = TenantTier.FREE
    credits_remaining: int = 10
    credits_per_window: int = 10
    last_refresh: float = field(default_factory=time.time)
    messages_processed: int = 0
    messages_throttled: int = 0

    def refresh_if_needed(self, refresh_interval: int = DEFAULT_REFRESH_INTERVAL) -> bool:
        """Refresh credits if the window has elapsed.

        Args:
            refresh_interval: Seconds between refreshes.

        Returns:
            True if credits were refreshed.
        """
        now = time.time()
        if now - self.last_refresh >= refresh_interval:
            self.credits_remaining = self.credits_per_window
            self.last_refresh = now
            return True
        return False

    def consume_credit(self, priority: str = "normal") -> bool:
        """Consume a credit for processing a message.

        Args:
            priority: Message priority.

        Returns:
            True if credit was available and consumed.
        """
        cost = PRIORITY_WEIGHTS.get(priority, 1)

        if self.credits_remaining >= cost:
            self.credits_remaining -= cost
            self.messages_processed += 1
            return True

        self.messages_throttled += 1
        return False

    def has_credits(self, priority: str = "normal") -> bool:
        """Check if tenant has credits available.

        Args:
            priority: Message priority.

        Returns:
            True if credits are available.
        """
        cost = PRIORITY_WEIGHTS.get(priority, 1)
        return self.credits_remaining >= cost


@dataclass
class SchedulingDecision:
    """Result of a scheduling decision."""

    allowed: bool
    workspace_id: str
    credits_remaining: int
    reason: str = ""
    wait_seconds: int = 0  # Suggested wait time if not allowed


class FairScheduler:
    """Fair scheduler for multi-tenant workflow processing.

    Tracks credits per tenant and makes scheduling decisions based on
    available credits and tenant tier.

    The scheduler can operate in two modes:
    1. In-memory: Fast but not shared across Lambda instances
    2. DynamoDB-backed: Shared state across instances (recommended for production)

    Example:
        scheduler = FairScheduler()
        decision = scheduler.should_process(workspace_id="ws_123", priority="normal")
        if decision.allowed:
            # Process the message
            process_message(message)
        else:
            # Defer or throttle
            logger.info("Tenant throttled", reason=decision.reason)
    """

    def __init__(
        self,
        refresh_interval: int | None = None,
        use_dynamodb: bool | None = None,
        table_name: str | None = None,
    ):
        """Initialize the fair scheduler.

        Args:
            refresh_interval: Seconds between credit refreshes.
            use_dynamodb: Whether to use DynamoDB for shared state.
            table_name: DynamoDB table name for credit tracking.
        """
        self.refresh_interval = refresh_interval or int(
            os.environ.get("SCHEDULER_REFRESH_INTERVAL", DEFAULT_REFRESH_INTERVAL)
        )
        self.use_dynamodb = use_dynamodb if use_dynamodb is not None else (
            os.environ.get("SCHEDULER_USE_DYNAMODB", "false").lower() == "true"
        )
        self.table_name = table_name or os.environ.get("SCHEDULER_TABLE_NAME", "complens-scheduler")

        # In-memory credit tracking (for single-instance or testing)
        self._credits: dict[str, TenantCredits] = {}
        self._dynamodb = None

        self.logger = logger.bind(
            service="fair_scheduler",
            use_dynamodb=self.use_dynamodb,
        )

    @property
    def dynamodb(self):
        """Get DynamoDB resource (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    def get_tenant_credits(
        self,
        workspace_id: str,
        tier: TenantTier | None = None,
    ) -> TenantCredits:
        """Get or create credit tracking for a tenant.

        Args:
            workspace_id: Workspace identifier.
            tier: Optional tier override.

        Returns:
            TenantCredits for the workspace.
        """
        if self.use_dynamodb:
            return self._get_credits_from_dynamodb(workspace_id, tier)
        return self._get_credits_from_memory(workspace_id, tier)

    def _get_credits_from_memory(
        self,
        workspace_id: str,
        tier: TenantTier | None = None,
    ) -> TenantCredits:
        """Get credits from in-memory cache.

        Args:
            workspace_id: Workspace identifier.
            tier: Optional tier override.

        Returns:
            TenantCredits.
        """
        if workspace_id not in self._credits:
            effective_tier = tier or TenantTier.FREE
            credits_per_window = TIER_CREDITS.get(effective_tier, 10)
            self._credits[workspace_id] = TenantCredits(
                workspace_id=workspace_id,
                tier=effective_tier,
                credits_remaining=credits_per_window,
                credits_per_window=credits_per_window,
            )

        credits = self._credits[workspace_id]

        # Update tier if provided
        if tier and tier != credits.tier:
            credits.tier = tier
            credits.credits_per_window = TIER_CREDITS.get(tier, 10)

        # Refresh credits if window elapsed
        credits.refresh_if_needed(self.refresh_interval)

        return credits

    def _get_credits_from_dynamodb(
        self,
        workspace_id: str,
        tier: TenantTier | None = None,
    ) -> TenantCredits:
        """Get credits from DynamoDB with atomic operations.

        Args:
            workspace_id: Workspace identifier.
            tier: Optional tier override.

        Returns:
            TenantCredits.
        """
        table = self.dynamodb.Table(self.table_name)

        try:
            # Try to get existing record
            response = table.get_item(
                Key={"PK": f"CREDITS#{workspace_id}", "SK": "CURRENT"},
            )
            item = response.get("Item")

            if item:
                credits = TenantCredits(
                    workspace_id=workspace_id,
                    tier=TenantTier(item.get("tier", "free")),
                    credits_remaining=int(item.get("credits_remaining", 0)),
                    credits_per_window=int(item.get("credits_per_window", 10)),
                    last_refresh=float(item.get("last_refresh", 0)),
                    messages_processed=int(item.get("messages_processed", 0)),
                    messages_throttled=int(item.get("messages_throttled", 0)),
                )

                # Check if refresh needed
                if credits.refresh_if_needed(self.refresh_interval):
                    self._save_credits_to_dynamodb(credits)

                return credits

            # Create new record
            effective_tier = tier or TenantTier.FREE
            credits_per_window = TIER_CREDITS.get(effective_tier, 10)
            credits = TenantCredits(
                workspace_id=workspace_id,
                tier=effective_tier,
                credits_remaining=credits_per_window,
                credits_per_window=credits_per_window,
            )
            self._save_credits_to_dynamodb(credits)
            return credits

        except ClientError as e:
            self.logger.error("DynamoDB error", error=str(e))
            # Fall back to in-memory
            return self._get_credits_from_memory(workspace_id, tier)

    def _save_credits_to_dynamodb(self, credits: TenantCredits) -> None:
        """Save credits to DynamoDB.

        Args:
            credits: Credits to save.
        """
        table = self.dynamodb.Table(self.table_name)

        try:
            table.put_item(
                Item={
                    "PK": f"CREDITS#{credits.workspace_id}",
                    "SK": "CURRENT",
                    "workspace_id": credits.workspace_id,
                    "tier": credits.tier.value,
                    "credits_remaining": credits.credits_remaining,
                    "credits_per_window": credits.credits_per_window,
                    "last_refresh": credits.last_refresh,
                    "messages_processed": credits.messages_processed,
                    "messages_throttled": credits.messages_throttled,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        except ClientError as e:
            self.logger.error("Failed to save credits", error=str(e))

    def should_process(
        self,
        workspace_id: str,
        priority: str = "normal",
        tier: TenantTier | None = None,
    ) -> SchedulingDecision:
        """Decide whether to process a message for a tenant.

        Args:
            workspace_id: Workspace identifier.
            priority: Message priority.
            tier: Optional tier override.

        Returns:
            SchedulingDecision with allowed status and reason.
        """
        credits = self.get_tenant_credits(workspace_id, tier)

        # High priority always allowed (emergency/admin actions)
        if priority == "high":
            return SchedulingDecision(
                allowed=True,
                workspace_id=workspace_id,
                credits_remaining=credits.credits_remaining,
                reason="high_priority",
            )

        # Check if credits available
        if credits.has_credits(priority):
            return SchedulingDecision(
                allowed=True,
                workspace_id=workspace_id,
                credits_remaining=credits.credits_remaining,
                reason="credits_available",
            )

        # Calculate wait time until next refresh
        time_since_refresh = time.time() - credits.last_refresh
        wait_seconds = max(0, int(self.refresh_interval - time_since_refresh))

        return SchedulingDecision(
            allowed=False,
            workspace_id=workspace_id,
            credits_remaining=0,
            reason="credits_exhausted",
            wait_seconds=wait_seconds,
        )

    def consume_credit(
        self,
        workspace_id: str,
        priority: str = "normal",
        tier: TenantTier | None = None,
    ) -> bool:
        """Consume a credit for processing a message.

        Should be called after successful message processing.

        Args:
            workspace_id: Workspace identifier.
            priority: Message priority.
            tier: Optional tier override.

        Returns:
            True if credit was consumed.
        """
        credits = self.get_tenant_credits(workspace_id, tier)
        consumed = credits.consume_credit(priority)

        # Save to DynamoDB if using shared state
        if self.use_dynamodb:
            self._save_credits_to_dynamodb(credits)

        return consumed

    def get_all_credits(self) -> dict[str, TenantCredits]:
        """Get all tracked tenant credits (in-memory only).

        Returns:
            Dict of workspace_id to TenantCredits.
        """
        return self._credits.copy()

    def get_statistics(self) -> dict[str, Any]:
        """Get scheduler statistics.

        Returns:
            Dict with scheduler stats.
        """
        stats = {
            "refresh_interval": self.refresh_interval,
            "use_dynamodb": self.use_dynamodb,
            "tenants_tracked": len(self._credits),
            "total_processed": sum(c.messages_processed for c in self._credits.values()),
            "total_throttled": sum(c.messages_throttled for c in self._credits.values()),
        }

        if self._credits:
            stats["credits_by_tier"] = {}
            for tier in TenantTier:
                tier_tenants = [c for c in self._credits.values() if c.tier == tier]
                if tier_tenants:
                    stats["credits_by_tier"][tier.value] = {
                        "count": len(tier_tenants),
                        "total_remaining": sum(c.credits_remaining for c in tier_tenants),
                        "avg_remaining": sum(c.credits_remaining for c in tier_tenants) / len(tier_tenants),
                    }

        return stats

    def reset_tenant(self, workspace_id: str) -> None:
        """Reset a tenant's credits (for testing or admin).

        Args:
            workspace_id: Workspace to reset.
        """
        if workspace_id in self._credits:
            del self._credits[workspace_id]

        if self.use_dynamodb:
            table = self.dynamodb.Table(self.table_name)
            try:
                table.delete_item(
                    Key={"PK": f"CREDITS#{workspace_id}", "SK": "CURRENT"},
                )
            except ClientError:
                pass

    def set_tier(
        self,
        workspace_id: str,
        tier: TenantTier,
    ) -> TenantCredits:
        """Set the tier for a workspace and adjust credits.

        Args:
            workspace_id: Workspace identifier.
            tier: New tier.

        Returns:
            Updated TenantCredits.
        """
        credits = self.get_tenant_credits(workspace_id, tier)
        credits.tier = tier
        credits.credits_per_window = TIER_CREDITS.get(tier, 10)

        # Optionally top up credits on tier upgrade
        if credits.credits_remaining < credits.credits_per_window:
            credits.credits_remaining = credits.credits_per_window

        if self.use_dynamodb:
            self._save_credits_to_dynamodb(credits)

        return credits


def get_fair_scheduler() -> FairScheduler:
    """Get a configured FairScheduler instance.

    Returns:
        FairScheduler instance.
    """
    return FairScheduler()
