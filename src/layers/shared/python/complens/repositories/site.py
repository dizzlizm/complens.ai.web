"""Site repository for DynamoDB operations."""

import structlog

from complens.models.site import Site
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class SiteRepository(BaseRepository[Site]):
    """Repository for Site entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize site repository."""
        super().__init__(Site, table_name)

    def get_by_id(self, workspace_id: str, site_id: str) -> Site | None:
        """Get site by ID.

        Args:
            workspace_id: The workspace ID.
            site_id: The site ID.

        Returns:
            Site or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"SITE#{site_id}")

    def get_by_domain(self, workspace_id: str, domain_name: str) -> Site | None:
        """Get site by domain name using GSI1.

        Args:
            workspace_id: The workspace ID.
            domain_name: The domain name.

        Returns:
            Site or None if not found.
        """
        items, _ = self.query(
            pk=f"WS#{workspace_id}#SITES",
            sk_begins_with=domain_name.lower(),
            index_name="GSI1",
            limit=1,
        )
        return items[0] if items else None

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Site], dict | None]:
        """List sites in a workspace.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum sites to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (sites, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="SITE#",
            limit=limit,
            last_key=last_key,
        )

    def create_site(self, site: Site) -> Site:
        """Create a new site.

        Args:
            site: The site to create.

        Returns:
            The created site.
        """
        return self.create(site, gsi_keys=site.get_gsi1_keys())

    def update_site(self, site: Site) -> Site:
        """Update an existing site.

        Args:
            site: The site to update.

        Returns:
            The updated site.
        """
        return self.update(site, gsi_keys=site.get_gsi1_keys())

    def delete_site(self, workspace_id: str, site_id: str) -> bool:
        """Delete a site.

        Args:
            workspace_id: The workspace ID.
            site_id: The site ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"SITE#{site_id}")
