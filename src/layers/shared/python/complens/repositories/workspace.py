"""Workspace repository for DynamoDB operations."""

from complens.models.workspace import Workspace
from complens.repositories.base import BaseRepository


class WorkspaceRepository(BaseRepository[Workspace]):
    """Repository for Workspace entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize workspace repository."""
        super().__init__(Workspace, table_name)

    def get_by_id(self, workspace_id: str) -> Workspace | None:
        """Get workspace by ID using GSI1.

        Args:
            workspace_id: The workspace ID.

        Returns:
            Workspace or None if not found.
        """
        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="META",
            index_name="GSI1",
            limit=1,
        )
        return items[0] if items else None

    def get_by_agency(self, agency_id: str, limit: int = 100) -> list[Workspace]:
        """Get all workspaces for an agency.

        Args:
            agency_id: The agency ID.
            limit: Maximum workspaces to return.

        Returns:
            List of workspaces.
        """
        items, _ = self.query(
            pk=f"AGENCY#{agency_id}",
            sk_begins_with="WS#",
            limit=limit,
        )
        return items

    def find_by_phone(self, phone: str) -> Workspace | None:
        """Find workspace by Twilio phone number using GSI2.

        Args:
            phone: Phone number (will be normalized).

        Returns:
            Workspace or None if not found.
        """
        # Normalize phone for lookup
        normalized = Workspace._normalize_phone(phone)

        items, _ = self.query(
            pk=f"PHONE#{normalized}",
            sk_begins_with="WS#",
            index_name="GSI2",
            limit=1,
        )
        return items[0] if items else None

    def _get_all_gsi_keys(self, workspace: Workspace) -> dict[str, str]:
        """Get all GSI keys for a workspace.

        Args:
            workspace: The workspace.

        Returns:
            Dict with all GSI keys.
        """
        keys = workspace.get_gsi1_keys()
        gsi2_keys = workspace.get_gsi2_keys()
        if gsi2_keys:
            keys.update(gsi2_keys)
        return keys

    def create_workspace(self, workspace: Workspace) -> Workspace:
        """Create a new workspace.

        Args:
            workspace: The workspace to create.

        Returns:
            The created workspace.
        """
        return self.create(workspace, gsi_keys=self._get_all_gsi_keys(workspace))

    def update_workspace(self, workspace: Workspace) -> Workspace:
        """Update an existing workspace.

        Args:
            workspace: The workspace to update.

        Returns:
            The updated workspace.
        """
        return self.update(workspace, gsi_keys=self._get_all_gsi_keys(workspace))

    def delete_workspace(self, agency_id: str, workspace_id: str) -> bool:
        """Delete a workspace.

        Args:
            agency_id: The agency ID.
            workspace_id: The workspace ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"AGENCY#{agency_id}", sk=f"WS#{workspace_id}")
