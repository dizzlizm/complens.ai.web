"""Repository for email warm-up domain operations."""

import os
import time
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

from complens.models.warmup_domain import WarmupDomain
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()

# Daily counter TTL: 30 days
COUNTER_TTL_DAYS = 30


class WarmupDomainRepository(BaseRepository[WarmupDomain]):
    """Repository for warm-up domain records and daily counters."""

    def __init__(self, table_name: str | None = None):
        """Initialize warm-up domain repository.

        Args:
            table_name: DynamoDB table name.
        """
        super().__init__(WarmupDomain, table_name)

    def get_by_domain(self, domain: str) -> WarmupDomain | None:
        """Get a warm-up record by domain.

        Args:
            domain: Email sending domain.

        Returns:
            WarmupDomain or None if not found.
        """
        return self.get(pk=f"WARMUP#{domain}", sk="META")

    def list_by_workspace(
        self,
        workspace_id: str,
        status: str | None = None,
        limit: int = 100,
        last_key: dict | None = None,
    ) -> tuple[list[WarmupDomain], dict | None]:
        """List warm-up domains for a workspace.

        Args:
            workspace_id: Workspace ID.
            status: Optional status filter.
            limit: Maximum items to return.
            last_key: Pagination key.

        Returns:
            Tuple of (warmup_domains, last_evaluated_key).
        """
        sk_prefix = f"{status}#" if status else None
        return self.query(
            pk=f"WS#{workspace_id}#WARMUPS",
            sk_begins_with=sk_prefix,
            index_name="GSI1",
            limit=limit,
            last_key=last_key,
        )

    def list_active(self, limit: int = 500) -> list[WarmupDomain]:
        """List all active warm-up domains across all workspaces.

        Uses a scan with filter since there's no GSI for global status queries.
        Expected volume is small (dozens of domains at most).

        Args:
            limit: Maximum items to return.

        Returns:
            List of active WarmupDomain records.
        """
        try:
            response = self.table.scan(
                FilterExpression="SK = :sk AND #s = :status",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":sk": "META",
                    ":status": "active",
                },
                Limit=limit,
            )
            return [WarmupDomain.from_dynamodb(item) for item in response.get("Items", [])]
        except ClientError as e:
            logger.error("Failed to list active warmup domains", error=str(e))
            raise

    def create_warmup(self, warmup: WarmupDomain) -> WarmupDomain:
        """Create a new warm-up domain record.

        Args:
            warmup: WarmupDomain to create.

        Returns:
            Created WarmupDomain.
        """
        gsi_keys = warmup.get_gsi1_keys()
        return self.create(warmup, gsi_keys=gsi_keys)

    def update_warmup(self, warmup: WarmupDomain) -> WarmupDomain:
        """Update a warm-up domain record.

        Args:
            warmup: WarmupDomain to update.

        Returns:
            Updated WarmupDomain.
        """
        gsi_keys = warmup.get_gsi1_keys()
        return self.update(warmup, gsi_keys=gsi_keys)

    def delete_warmup(self, domain: str) -> bool:
        """Delete a warm-up domain record.

        Args:
            domain: Email sending domain.

        Returns:
            True if deleted.
        """
        return self.delete(pk=f"WARMUP#{domain}", sk="META")

    # -------------------------------------------------------------------------
    # Atomic daily counters (raw DynamoDB operations, not model-based)
    # -------------------------------------------------------------------------

    def increment_daily_send(self, domain: str, date_str: str, daily_limit: int) -> int:
        """Atomically increment the daily send counter.

        Creates the counter item if it doesn't exist. Returns the new count
        so the caller can check against the limit.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).
            daily_limit: Current daily limit (stored on the counter for reference).

        Returns:
            New send_count after increment.
        """
        ttl = int(time.time()) + (COUNTER_TTL_DAYS * 86400)

        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression=(
                    "SET #limit = :limit, #ttl = :ttl "
                    "ADD send_count :one"
                ),
                ExpressionAttributeNames={
                    "#limit": "daily_limit",
                    "#ttl": "ttl",
                },
                ExpressionAttributeValues={
                    ":one": 1,
                    ":limit": daily_limit,
                    ":ttl": ttl,
                },
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"]["send_count"])
        except ClientError as e:
            logger.error(
                "Failed to increment daily send counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def increment_daily_bounce(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily bounce counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New bounce_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD bounce_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("bounce_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily bounce counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def increment_daily_complaint(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily complaint counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New complaint_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD complaint_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("complaint_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily complaint counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def get_daily_counter(self, domain: str, date_str: str) -> dict[str, Any] | None:
        """Get daily counter for a domain and date.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            Counter dict with send_count, bounce_count, complaint_count, daily_limit,
            or None if no counter exists.
        """
        try:
            response = self.table.get_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
            )
            item = response.get("Item")
            if not item:
                return None
            return {
                "send_count": int(item.get("send_count", 0)),
                "bounce_count": int(item.get("bounce_count", 0)),
                "complaint_count": int(item.get("complaint_count", 0)),
                "daily_limit": int(item.get("daily_limit", 0)),
            }
        except ClientError as e:
            logger.error(
                "Failed to get daily counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise
