"""Page repository for DynamoDB operations."""

import boto3
import structlog
from botocore.exceptions import ClientError

from complens.models.page import Page, PageStatus
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class PageRepository(BaseRepository[Page]):
    """Repository for Page entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize page repository."""
        super().__init__(Page, table_name)

    def get_by_id(self, workspace_id: str, page_id: str) -> Page | None:
        """Get page by ID.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.

        Returns:
            Page or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"PAGE#{page_id}")

    def get_by_slug(self, workspace_id: str, slug: str) -> Page | None:
        """Get page by slug using GSI1.

        Args:
            workspace_id: The workspace ID.
            slug: The page slug.

        Returns:
            Page or None if not found.
        """
        items, _ = self.query(
            pk=f"PAGE_SLUG#{workspace_id}",
            sk_begins_with=slug,
            index_name="GSI1",
            limit=1,
        )
        return items[0] if items else None

    def get_by_custom_domain(self, domain: str) -> Page | None:
        """Get page by custom domain using GSI2.

        Args:
            domain: The custom domain.

        Returns:
            Page or None if not found.
        """
        items, _ = self.query(
            pk=f"PAGE_DOMAIN#{domain.lower()}",
            sk_begins_with="PAGE#",
            index_name="GSI2",
            limit=1,
        )
        return items[0] if items else None

    def get_by_subdomain(self, subdomain: str) -> Page | None:
        """Get page by subdomain using GSI3.

        Args:
            subdomain: The subdomain (e.g., 'mypage' for mypage.complens.ai).

        Returns:
            Page or None if not found.
        """
        items, _ = self.query(
            pk=f"PAGE_SUBDOMAIN#{subdomain.lower()}",
            sk_begins_with="PAGE#",
            index_name="GSI3",
            limit=1,
        )
        return items[0] if items else None

    def subdomain_exists(self, subdomain: str, exclude_page_id: str | None = None) -> bool:
        """Check if a subdomain is already in use globally.

        Args:
            subdomain: The subdomain to check.
            exclude_page_id: Page ID to exclude from check (for updates).

        Returns:
            True if subdomain exists, False otherwise.
        """
        page = self.get_by_subdomain(subdomain)
        if not page:
            return False
        if exclude_page_id and page.id == exclude_page_id:
            return False
        return True

    def list_by_site(
        self,
        workspace_id: str,
        site_id: str,
        status: PageStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Page], dict | None]:
        """List pages for a specific site.

        Uses FilterExpression on the workspace partition to find pages
        with a matching site_id.

        Args:
            workspace_id: The workspace ID.
            site_id: The site ID.
            status: Optional status filter.
            limit: Maximum pages to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (pages, next_page_key).
        """
        filter_expression = "site_id = :site_id"
        expression_values: dict = {":site_id": site_id}
        expression_names = None

        if status:
            filter_expression += " AND #status = :status"
            expression_values[":status"] = status.value
            expression_names = {"#status": "status"}

        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="PAGE#",
            limit=limit,
            last_key=last_key,
            filter_expression=filter_expression,
            expression_values=expression_values,
            expression_names=expression_names,
        )

    def list_by_workspace(
        self,
        workspace_id: str,
        status: PageStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Page], dict | None]:
        """List pages in a workspace.

        Args:
            workspace_id: The workspace ID.
            status: Optional status filter.
            limit: Maximum pages to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (pages, next_page_key).
        """
        filter_expression = None
        expression_values = None

        if status:
            filter_expression = "#status = :status"
            expression_values = {":status": status.value}

        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="PAGE#",
            limit=limit,
            last_key=last_key,
            filter_expression=filter_expression,
            expression_values=expression_values,
            expression_names={"#status": "status"} if status else None,
        )

    def list_published(
        self,
        workspace_id: str,
        limit: int = 50,
    ) -> list[Page]:
        """List published pages in a workspace.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum pages to return.

        Returns:
            List of published pages.
        """
        pages, _ = self.list_by_workspace(
            workspace_id, status=PageStatus.PUBLISHED, limit=limit
        )
        return pages

    def create_page(self, page: Page) -> Page:
        """Create a new page with slug uniqueness enforced.

        Uses a DynamoDB TransactWriteItems to atomically create both the page
        and a slug reservation item, preventing duplicate slugs from race
        conditions.

        Args:
            page: The page to create.

        Returns:
            The created page.

        Raises:
            ConflictError: If the slug is already taken.
        """
        from complens.utils.exceptions import ConflictError

        page.update_timestamp()

        gsi_keys = page.get_gsi1_keys()
        gsi2_keys = page.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        gsi3_keys = page.get_gsi3_keys()
        if gsi3_keys:
            gsi_keys.update(gsi3_keys)

        # Build the page item
        db_item = page.to_dynamodb()
        db_item.update(page.get_keys())
        if gsi_keys:
            db_item.update(gsi_keys)

        # Build the slug reservation item (prevents race conditions)
        slug_key = {
            "PK": f"SLUG#{page.workspace_id}",
            "SK": f"SLUG#{page.slug}",
            "page_id": page.id,
        }

        try:
            client = boto3.client("dynamodb")
            # Serialize items for the low-level client
            from boto3.dynamodb.types import TypeSerializer

            serializer = TypeSerializer()

            page_item_serialized = {k: serializer.serialize(v) for k, v in db_item.items()}
            slug_item_serialized = {k: serializer.serialize(v) for k, v in slug_key.items()}

            client.transact_write_items(
                TransactItems=[
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": page_item_serialized,
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                    {
                        "Put": {
                            "TableName": self.table_name,
                            "Item": slug_item_serialized,
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                ]
            )

            logger.debug("Page created with slug reservation", page_id=page.id, slug=page.slug)
            return page

        except ClientError as e:
            if e.response["Error"]["Code"] == "TransactionCanceledException":
                reasons = e.response.get("CancellationReasons", [])
                # If second item (slug) failed, it's a duplicate slug
                if len(reasons) > 1 and reasons[1].get("Code") == "ConditionalCheckFailed":
                    raise ConflictError(f"Slug '{page.slug}' is already in use")
                raise ConflictError("Page already exists or slug conflict")
            raise

    def update_page(self, page: Page) -> Page:
        """Update an existing page.

        Args:
            page: The page to update.

        Returns:
            The updated page.
        """
        gsi_keys = page.get_gsi1_keys()
        gsi2_keys = page.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        gsi3_keys = page.get_gsi3_keys()
        if gsi3_keys:
            gsi_keys.update(gsi3_keys)
        return self.update(page, gsi_keys=gsi_keys)

    def delete_page(self, workspace_id: str, page_id: str) -> bool:
        """Delete a page and its slug reservation.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.

        Returns:
            True if deleted, False if not found.
        """
        # Look up the page first to get its slug for cleanup
        page = self.get_by_id(workspace_id, page_id)
        if page and page.slug:
            try:
                self.table.delete_item(
                    Key={"PK": f"SLUG#{workspace_id}", "SK": f"SLUG#{page.slug}"}
                )
            except ClientError:
                logger.warning(
                    "Failed to delete slug reservation",
                    workspace_id=workspace_id,
                    slug=page.slug,
                )

        return self.delete(pk=f"WS#{workspace_id}", sk=f"PAGE#{page_id}")

    def increment_view_count(self, workspace_id: str, page_id: str) -> None:
        """Increment the view count for a page.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.
        """
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"PAGE#{page_id}",
            },
            UpdateExpression="SET view_count = if_not_exists(view_count, :zero) + :inc",
            ExpressionAttributeValues={":inc": 1, ":zero": 0},
        )

    def increment_form_submission_count(self, workspace_id: str, page_id: str) -> None:
        """Increment the form submission count for a page.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.
        """
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"PAGE#{page_id}",
            },
            UpdateExpression="SET form_submission_count = if_not_exists(form_submission_count, :zero) + :inc",
            ExpressionAttributeValues={":inc": 1, ":zero": 0},
        )

    def increment_chat_session_count(self, workspace_id: str, page_id: str) -> None:
        """Increment the chat session count for a page.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.
        """
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"PAGE#{page_id}",
            },
            UpdateExpression="SET chat_session_count = if_not_exists(chat_session_count, :zero) + :inc",
            ExpressionAttributeValues={":inc": 1, ":zero": 0},
        )

    def slug_exists(self, workspace_id: str, slug: str, exclude_page_id: str | None = None) -> bool:
        """Check if a slug is already in use.

        Args:
            workspace_id: The workspace ID.
            slug: The slug to check.
            exclude_page_id: Page ID to exclude from check (for updates).

        Returns:
            True if slug exists, False otherwise.
        """
        page = self.get_by_slug(workspace_id, slug)
        if not page:
            return False
        if exclude_page_id and page.id == exclude_page_id:
            return False
        return True
