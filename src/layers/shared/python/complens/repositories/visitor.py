"""Visitor repository for anonymous visitor tracking.

Uses DynamoDB UpdateItem with if_not_exists for atomic upserts,
ensuring first-touch attribution fields are never overwritten.
"""

import os
from datetime import datetime, timezone

import boto3
import structlog
from boto3.dynamodb.conditions import Key

from complens.models.visitor import Visitor

logger = structlog.get_logger()

# Cap pages_visited list to prevent unbounded growth
MAX_PAGES_VISITED = 50


class VisitorRepository:
    """Repository for Visitor records in DynamoDB."""

    def __init__(self, table_name: str | None = None):
        self.table_name = table_name or os.environ.get("TABLE_NAME", "complens-dev")
        self._dynamodb = None
        self._table = None

    @property
    def dynamodb(self):
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    @property
    def table(self):
        if self._table is None:
            self._table = self.dynamodb.Table(self.table_name)
        return self._table

    def get_by_visitor_id(self, workspace_id: str, visitor_id: str) -> Visitor | None:
        """Get a visitor by workspace and visitor ID.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID (from cookie).

        Returns:
            Visitor or None if not found.
        """
        response = self.table.get_item(
            Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
        )
        item = response.get("Item")
        if not item:
            return None
        return Visitor.from_dynamodb(item)

    def upsert_page_view(
        self,
        workspace_id: str,
        visitor_id: str,
        page_id: str,
        referrer: str | None = None,
        utm_source: str | None = None,
        utm_medium: str | None = None,
        utm_campaign: str | None = None,
        utm_content: str | None = None,
        utm_term: str | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Create or update a visitor on page view.

        Uses if_not_exists for first-touch fields so they are only set
        on the initial visit and never overwritten.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID (from cookie).
            page_id: Page being viewed.
            referrer: HTTP referrer.
            utm_source: UTM source parameter.
            utm_medium: UTM medium parameter.
            utm_campaign: UTM campaign parameter.
            utm_content: UTM content parameter.
            utm_term: UTM term parameter.
            ip: Client IP address.
            user_agent: Client user agent string.
        """
        now = datetime.now(timezone.utc).isoformat()

        # Build update expression parts
        set_parts = [
            "workspace_id = if_not_exists(workspace_id, :ws_id)",
            "visitor_id = if_not_exists(visitor_id, :vid)",
            "first_page_id = if_not_exists(first_page_id, :page_id)",
            "first_referrer = if_not_exists(first_referrer, :referrer)",
            "first_utm_source = if_not_exists(first_utm_source, :utm_source)",
            "first_utm_medium = if_not_exists(first_utm_medium, :utm_medium)",
            "first_utm_campaign = if_not_exists(first_utm_campaign, :utm_campaign)",
            "first_utm_content = if_not_exists(first_utm_content, :utm_content)",
            "first_utm_term = if_not_exists(first_utm_term, :utm_term)",
            "user_agent = if_not_exists(user_agent, :ua)",
            "ip = if_not_exists(ip, :ip)",
            "created_at = if_not_exists(created_at, :now)",
            # Always update last-touch fields
            "last_page_id = :page_id",
            "last_referrer = :referrer",
            "last_seen = :now",
            "updated_at = :now",
        ]

        expr_values = {
            ":ws_id": workspace_id,
            ":vid": visitor_id,
            ":page_id": page_id,
            ":referrer": referrer,
            ":utm_source": utm_source,
            ":utm_medium": utm_medium,
            ":utm_campaign": utm_campaign,
            ":utm_content": utm_content,
            ":utm_term": utm_term,
            ":ua": user_agent[:500] if user_agent else None,
            ":ip": ip,
            ":now": now,
            ":one": 1,
            ":page_list": [page_id],
            ":max_pages": MAX_PAGES_VISITED,
            ":empty_list": [],
        }

        # Atomic increment page view counter
        add_parts = ["total_page_views :one"]

        update_expr = f"SET {', '.join(set_parts)} ADD {', '.join(add_parts)}"

        try:
            self.table.update_item(
                Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
            )

            # Append page_id to pages_visited (separate call to handle list size cap)
            self._append_page_visited(workspace_id, visitor_id, page_id)

        except Exception as e:
            logger.exception(
                "Failed to upsert visitor page view",
                workspace_id=workspace_id,
                visitor_id=visitor_id,
                error=str(e),
            )
            raise

    def _append_page_visited(
        self, workspace_id: str, visitor_id: str, page_id: str
    ) -> None:
        """Append page_id to pages_visited list, capped at MAX_PAGES_VISITED.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID.
            page_id: Page ID to append.
        """
        try:
            # First, try to append to existing list
            self.table.update_item(
                Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
                UpdateExpression="SET pages_visited = list_append(if_not_exists(pages_visited, :empty), :page)",
                ConditionExpression="attribute_not_exists(pages_visited) OR size(pages_visited) < :max_size",
                ExpressionAttributeValues={
                    ":page": [page_id],
                    ":empty": [],
                    ":max_size": MAX_PAGES_VISITED,
                },
            )
        except self.dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
            # List is at max size — skip appending (oldest pages are preserved)
            pass
        except Exception as e:
            # Non-critical — don't fail the page view tracking
            logger.warning(
                "Failed to append page to pages_visited",
                visitor_id=visitor_id,
                error=str(e),
            )

    def link_to_contact(
        self, workspace_id: str, visitor_id: str, contact_id: str
    ) -> None:
        """Link a visitor to a contact on form conversion.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID.
            contact_id: Contact ID to link.
        """
        try:
            self.table.update_item(
                Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
                UpdateExpression="SET contact_id = :cid, updated_at = :now",
                ExpressionAttributeValues={
                    ":cid": contact_id,
                    ":now": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.exception(
                "Failed to link visitor to contact",
                visitor_id=visitor_id,
                contact_id=contact_id,
                error=str(e),
            )

    def increment_chat_messages(self, workspace_id: str, visitor_id: str) -> None:
        """Atomically increment the chat message counter.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID.
        """
        try:
            self.table.update_item(
                Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
                UpdateExpression="ADD total_chat_messages :one SET updated_at = :now",
                ExpressionAttributeValues={
                    ":one": 1,
                    ":now": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to increment visitor chat messages",
                visitor_id=visitor_id,
                error=str(e),
            )

    def increment_form_submissions(self, workspace_id: str, visitor_id: str) -> None:
        """Atomically increment the form submission counter.

        Args:
            workspace_id: Workspace ID.
            visitor_id: Visitor ID.
        """
        try:
            self.table.update_item(
                Key={"PK": f"WS#{workspace_id}", "SK": f"VISITOR#{visitor_id}"},
                UpdateExpression="ADD total_form_submissions :one SET updated_at = :now",
                ExpressionAttributeValues={
                    ":one": 1,
                    ":now": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to increment visitor form submissions",
                visitor_id=visitor_id,
                error=str(e),
            )
