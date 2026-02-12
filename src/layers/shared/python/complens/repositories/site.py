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

    def _all_gsi_keys(self, site: Site) -> dict[str, str]:
        """Merge GSI1 + GSI3 keys for a site."""
        keys = site.get_gsi1_keys()
        keys.update(site.get_gsi3_keys())
        return keys

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

    def get_by_domain_global(self, domain_name: str) -> Site | None:
        """Get site by domain name globally using GSI3.

        Used for public domain resolution where workspace_id is unknown.

        Args:
            domain_name: The domain name.

        Returns:
            Site or None if not found.
        """
        items, _ = self.query(
            pk=f"SITE_DOMAIN#{domain_name.lower()}",
            sk_begins_with="SITE#",
            index_name="GSI3",
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
        return self.create(site, gsi_keys=self._all_gsi_keys(site))

    def update_site(self, site: Site) -> Site:
        """Update an existing site.

        Args:
            site: The site to update.

        Returns:
            The updated site.
        """
        return self.update(site, gsi_keys=self._all_gsi_keys(site))

    def delete_site(self, workspace_id: str, site_id: str) -> bool:
        """Delete a site.

        Args:
            workspace_id: The workspace ID.
            site_id: The site ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"SITE#{site_id}")
