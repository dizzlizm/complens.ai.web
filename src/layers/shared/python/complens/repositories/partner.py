"""Partner repository for DynamoDB operations."""

from complens.models.partner import Partner
from complens.repositories.base import BaseRepository


class PartnerRepository(BaseRepository[Partner]):
    """Repository for Partner entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize partner repository."""
        super().__init__(Partner, table_name)

    def get_by_id(self, workspace_id: str, partner_id: str) -> Partner | None:
        """Get partner by ID.

        Args:
            workspace_id: The workspace ID.
            partner_id: The partner ID.

        Returns:
            Partner or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"PARTNER#{partner_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 200,
        last_key: dict | None = None,
    ) -> tuple[list[Partner], dict | None]:
        """List all partners in a workspace.

        Returns all partners for Kanban board display. Frontend groups by stage.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum partners to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (partners, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="PARTNER#",
            limit=limit,
            last_key=last_key,
        )

    def list_by_stage(
        self,
        workspace_id: str,
        stage: str,
        limit: int = 50,
    ) -> tuple[list[Partner], dict | None]:
        """List partners in a specific stage using GSI1.

        Args:
            workspace_id: The workspace ID.
            stage: The pipeline stage name.
            limit: Maximum partners to return.

        Returns:
            Tuple of (partners, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}#PARTNERS",
            sk_begins_with=f"{stage}#",
            index_name="GSI1",
            limit=limit,
        )

    def list_by_contact(
        self,
        contact_id: str,
        limit: int = 50,
    ) -> tuple[list[Partner], dict | None]:
        """List partners linked to a contact using GSI2.

        Args:
            contact_id: The contact ID.
            limit: Maximum partners to return.

        Returns:
            Tuple of (partners, next_page_key).
        """
        return self.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="PARTNER#",
            index_name="GSI2",
            limit=limit,
        )

    def _get_all_gsi_keys(self, partner: Partner) -> dict[str, str] | None:
        """Get all GSI keys for a partner."""
        gsi_keys = partner.get_gsi1_keys() or {}
        gsi2_keys = partner.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        return gsi_keys or None

    def create_partner(self, partner: Partner) -> Partner:
        """Create a new partner.

        Args:
            partner: The partner to create.

        Returns:
            The created partner.
        """
        return self.create(partner, gsi_keys=self._get_all_gsi_keys(partner))

    def update_partner(self, partner: Partner) -> Partner:
        """Update an existing partner.

        Args:
            partner: The partner to update.

        Returns:
            The updated partner.
        """
        return self.update(partner, gsi_keys=self._get_all_gsi_keys(partner))

    def delete_partner(self, workspace_id: str, partner_id: str) -> bool:
        """Delete a partner.

        Args:
            workspace_id: The workspace ID.
            partner_id: The partner ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"PARTNER#{partner_id}")
