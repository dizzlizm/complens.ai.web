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

    def list_by_site(
        self,
        workspace_id: str,
        site_id: str,
        status: str | None = None,
        limit: int = 100,
    ) -> list[WarmupDomain]:
        """List warm-up domains for a specific site.

        Uses a DynamoDB filter expression on site_id so results are correct
        even when the workspace has more warmups than ``limit``.

        Args:
            workspace_id: Workspace ID.
            site_id: Site ID to filter by.
            status: Optional status filter.
            limit: Maximum items to return.

        Returns:
            List of WarmupDomain records for the site.
        """
        sk_prefix = f"{status}#" if status else None
        warmups, _ = self.query(
            pk=f"WS#{workspace_id}#WARMUPS",
            sk_begins_with=sk_prefix,
            index_name="GSI1",
            limit=limit,
            filter_expression="site_id = :site_id",
            expression_values={":site_id": site_id},
        )
        return warmups

    def list_active(self, limit: int = 500) -> list[WarmupDomain]:
        """List all active warm-up domains across all workspaces.

        Uses GSI4 (WARMUP_ACTIVE partition) with scan fallback for pre-GSI4 items.

        Args:
            limit: Maximum items to return.

        Returns:
            List of active WarmupDomain records.
        """
        # Try GSI4 first (efficient)
        try:
            items, _ = self.query(
                pk="WARMUP_ACTIVE",
                index_name="GSI4",
                limit=limit,
            )
            if items:
                return items
        except Exception:
            pass

        # Fallback scan for pre-GSI4 data
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

    def _get_all_gsi_keys(self, warmup: WarmupDomain) -> dict[str, str]:
        """Get all GSI keys for a warmup domain."""
        keys = warmup.get_gsi1_keys()
        gsi4_keys = warmup.get_gsi4_keys()
        if gsi4_keys:
            keys.update(gsi4_keys)
        return keys

    def create_warmup(self, warmup: WarmupDomain) -> WarmupDomain:
        """Create a new warm-up domain record.

        Args:
            warmup: WarmupDomain to create.

        Returns:
            Created WarmupDomain.
        """
        return self.create(warmup, gsi_keys=self._get_all_gsi_keys(warmup))

    def update_warmup(self, warmup: WarmupDomain) -> WarmupDomain:
        """Update a warm-up domain record.

        Args:
            warmup: WarmupDomain to update.

        Returns:
            Updated WarmupDomain.
        """
        return self.update(warmup, gsi_keys=self._get_all_gsi_keys(warmup))

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

    def increment_daily_delivery(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily delivery counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New delivery_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD delivery_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("delivery_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily delivery counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def increment_daily_open(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily open counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New open_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD open_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("open_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily open counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def increment_daily_click(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily click counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New click_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD click_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("click_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily click counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def increment_hourly_send(self, domain: str, date_str: str, hour: int, hourly_limit: int) -> int:
        """Atomically increment the hourly send counter.

        Creates an hourly counter item with a 48h TTL.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).
            hour: Hour of day (0-23).
            hourly_limit: Current hourly limit (stored for reference).

        Returns:
            New hourly_count after increment.
        """
        ttl = int(time.time()) + (2 * 86400)  # 48h TTL

        try:
            response = self.table.update_item(
                Key={
                    "PK": f"WARMUP#{domain}",
                    "SK": f"HOUR#{date_str}#{hour:02d}",
                },
                UpdateExpression=(
                    "SET #limit = :limit, #ttl = :ttl "
                    "ADD hourly_count :one"
                ),
                ExpressionAttributeNames={
                    "#limit": "hourly_limit",
                    "#ttl": "ttl",
                },
                ExpressionAttributeValues={
                    ":one": 1,
                    ":limit": hourly_limit,
                    ":ttl": ttl,
                },
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"]["hourly_count"])
        except ClientError as e:
            logger.error(
                "Failed to increment hourly send counter",
                domain=domain,
                date=date_str,
                hour=hour,
                error=str(e),
            )
            raise

    def increment_daily_reply(self, domain: str, date_str: str) -> int:
        """Atomically increment the daily reply counter.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            New reply_count after increment.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"WARMUP#{domain}", "SK": f"DAY#{date_str}"},
                UpdateExpression="ADD reply_count :one",
                ExpressionAttributeValues={":one": 1},
                ReturnValues="ALL_NEW",
            )
            return int(response["Attributes"].get("reply_count", 0))
        except ClientError as e:
            logger.error(
                "Failed to increment daily reply counter",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def record_warmup_email(
        self, domain: str, date_str: str, email_data: dict[str, Any],
    ) -> None:
        """Store a sent warmup email record for audit and subject dedup.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).
            email_data: Dict with subject, recipient, content_type, etc.
        """
        from ulid import ULID

        ttl = int(time.time()) + (30 * 86400)  # 30-day TTL
        email_id = str(ULID())

        try:
            self.table.put_item(Item={
                "PK": f"WARMUP#{domain}",
                "SK": f"EMAIL#{date_str}#{email_id}",
                "subject": email_data.get("subject", ""),
                "recipient": email_data.get("recipient", ""),
                "from_email": email_data.get("from_email", ""),
                "content_type": email_data.get("content_type", ""),
                "sent_at": email_data.get("sent_at", ""),
                "ttl": ttl,
            })
        except ClientError as e:
            logger.error(
                "Failed to record warmup email",
                domain=domain,
                date=date_str,
                error=str(e),
            )
            raise

    def get_recent_warmup_emails(
        self, domain: str, date_str: str, limit: int = 20,
        since_date: str | None = None,
    ) -> list[dict[str, Any]]:
        """Query recent warmup emails for a domain.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD) to query from (inclusive, backward).
            limit: Maximum items to return.
            since_date: Optional lower-bound date (YYYY-MM-DD) to filter out
                emails from previous warmup instances.

        Returns:
            List of warmup email records.
        """
        try:
            if since_date:
                key_expr = "PK = :pk AND SK BETWEEN :sk_start AND :sk_end"
                expr_values = {
                    ":pk": f"WARMUP#{domain}",
                    ":sk_start": f"EMAIL#{since_date}",
                    ":sk_end": "EMAIL#~",
                }
            else:
                key_expr = "PK = :pk AND begins_with(SK, :prefix)"
                expr_values = {
                    ":pk": f"WARMUP#{domain}",
                    ":prefix": "EMAIL#",
                }

            response = self.table.query(
                KeyConditionExpression=key_expr,
                ExpressionAttributeValues=expr_values,
                ScanIndexForward=False,
                Limit=limit,
            )
            return [
                {
                    "subject": item.get("subject", ""),
                    "recipient": item.get("recipient", ""),
                    "from_email": item.get("from_email", ""),
                    "content_type": item.get("content_type", ""),
                    "sent_at": item.get("sent_at", ""),
                }
                for item in response.get("Items", [])
            ]
        except ClientError as e:
            logger.error(
                "Failed to get recent warmup emails",
                domain=domain,
                error=str(e),
            )
            raise

    def get_daily_counter(self, domain: str, date_str: str) -> dict[str, Any] | None:
        """Get daily counter for a domain and date.

        Args:
            domain: Email sending domain.
            date_str: Date string (YYYY-MM-DD).

        Returns:
            Counter dict with send_count, bounce_count, complaint_count,
            delivery_count, open_count, click_count, reply_count, daily_limit,
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
                "delivery_count": int(item.get("delivery_count", 0)),
                "open_count": int(item.get("open_count", 0)),
                "click_count": int(item.get("click_count", 0)),
                "reply_count": int(item.get("reply_count", 0)),
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
