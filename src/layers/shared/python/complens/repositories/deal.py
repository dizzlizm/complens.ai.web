"""Deal repository for DynamoDB operations."""

from complens.models.deal import Deal
from complens.repositories.base import BaseRepository


class DealRepository(BaseRepository[Deal]):
    """Repository for Deal entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize deal repository."""
        super().__init__(Deal, table_name)

    def get_by_id(self, workspace_id: str, deal_id: str) -> Deal | None:
        """Get deal by ID.

        Args:
            workspace_id: The workspace ID.
            deal_id: The deal ID.

        Returns:
            Deal or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"DEAL#{deal_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 200,
        last_key: dict | None = None,
    ) -> tuple[list[Deal], dict | None]:
        """List all deals in a workspace.

        Returns all deals for Kanban board display. Frontend groups by stage.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum deals to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (deals, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="DEAL#",
            limit=limit,
            last_key=last_key,
        )

    def list_by_stage(
        self,
        workspace_id: str,
        stage: str,
        limit: int = 50,
    ) -> tuple[list[Deal], dict | None]:
        """List deals in a specific stage using GSI1.

        Args:
            workspace_id: The workspace ID.
            stage: The pipeline stage name.
            limit: Maximum deals to return.

        Returns:
            Tuple of (deals, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}#DEALS",
            sk_begins_with=f"{stage}#",
            index_name="GSI1",
            limit=limit,
        )

    def list_by_contact(
        self,
        contact_id: str,
        limit: int = 50,
    ) -> tuple[list[Deal], dict | None]:
        """List deals linked to a contact using GSI2.

        Args:
            contact_id: The contact ID.
            limit: Maximum deals to return.

        Returns:
            Tuple of (deals, next_page_key).
        """
        return self.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="DEAL#",
            index_name="GSI2",
            limit=limit,
        )

    def _get_all_gsi_keys(self, deal: Deal) -> dict[str, str] | None:
        """Get all GSI keys for a deal."""
        gsi_keys = deal.get_gsi1_keys() or {}
        gsi2_keys = deal.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        return gsi_keys or None

    def create_deal(self, deal: Deal) -> Deal:
        """Create a new deal.

        Args:
            deal: The deal to create.

        Returns:
            The created deal.
        """
        return self.create(deal, gsi_keys=self._get_all_gsi_keys(deal))

    def update_deal(self, deal: Deal) -> Deal:
        """Update an existing deal.

        Args:
            deal: The deal to update.

        Returns:
            The updated deal.
        """
        return self.update(deal, gsi_keys=self._get_all_gsi_keys(deal))

    def delete_deal(self, workspace_id: str, deal_id: str) -> bool:
        """Delete a deal.

        Args:
            workspace_id: The workspace ID.
            deal_id: The deal ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"DEAL#{deal_id}")
