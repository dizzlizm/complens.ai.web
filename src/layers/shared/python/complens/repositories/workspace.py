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
        keys.update(workspace.get_gsi4_keys())
        return keys

    def create_workspace(self, workspace: Workspace) -> Workspace:
        """Create a new workspace.

        Args:
            workspace: The workspace to create.

        Returns:
            The created workspace.
        """
        return self.create(workspace, gsi_keys=self._get_all_gsi_keys(workspace))

    def update_workspace(self, workspace: Workspace, check_version: bool = True) -> Workspace:
        """Update an existing workspace.

        Args:
            workspace: The workspace to update.
            check_version: Whether to enforce optimistic locking.

        Returns:
            The updated workspace.
        """
        return self.update(workspace, gsi_keys=self._get_all_gsi_keys(workspace), check_version=check_version)

    def delete_workspace(self, agency_id: str, workspace_id: str) -> bool:
        """Delete a workspace.

        Args:
            agency_id: The agency ID.
            workspace_id: The workspace ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"AGENCY#{agency_id}", sk=f"WS#{workspace_id}")

    def list_all(self, limit: int = 50, last_key: dict | None = None) -> tuple[list[Workspace], dict | None]:
        """List all workspaces across all agencies.

        Used by super admin panel for platform-wide workspace view.
        Uses GSI4 (ALL_WORKSPACES partition) for workspaces that have been
        indexed, with a scan fallback to catch any pre-GSI4 items.

        Args:
            limit: Maximum workspaces to return.
            last_key: Last evaluated key for pagination.

        Returns:
            Tuple of (workspaces, last_evaluated_key).
        """
        # Try GSI4 first (efficient - all workspaces stored under ALL_WORKSPACES partition)
        try:
            workspaces, next_key = self.query(
                pk="ALL_WORKSPACES",
                sk_begins_with="WS#",
                index_name="GSI4",
                limit=limit,
                last_key=last_key,
            )
            # Only trust GSI4 if it returned a full page (meaning it has complete data)
            # or if there's a next_key (meaning there's more data)
            if len(workspaces) >= limit or (workspaces and next_key):
                return workspaces, next_key
            # If GSI4 returned some but fewer than limit with no next_key,
            # it might be incomplete. Fall through to scan to get all items.
            if workspaces:
                gsi4_ids = {ws.id for ws in workspaces}
            else:
                gsi4_ids = set()
        except Exception:
            gsi4_ids = set()

        # Scan fallback to catch pre-GSI4 items (or as primary if GSI4 is empty).
        # DynamoDB Limit applies BEFORE FilterExpression, so we must loop
        # until we have enough matching items.
        from botocore.exceptions import ClientError

        try:
            workspaces: list[Workspace] = []
            scan_kwargs: dict = {
                "FilterExpression": "begins_with(SK, :sk_prefix)",
                "ExpressionAttributeValues": {":sk_prefix": "WS#"},
                "Limit": 500,
            }

            if last_key and not gsi4_ids:
                scan_kwargs["ExclusiveStartKey"] = last_key

            last_evaluated_key = None
            while len(workspaces) < limit:
                response = self.table.scan(**scan_kwargs)
                for item in response.get("Items", []):
                    ws = self.model_class.from_dynamodb(item)
                    # Deduplicate against GSI4 results
                    if ws.id not in gsi4_ids:
                        workspaces.append(ws)
                    if len(workspaces) >= limit:
                        break
                last_evaluated_key = response.get("LastEvaluatedKey")
                if not last_evaluated_key:
                    break
                scan_kwargs["ExclusiveStartKey"] = last_evaluated_key

            # Prepend any GSI4 results we found earlier
            if gsi4_ids:
                gsi4_workspaces, _ = self.query(
                    pk="ALL_WORKSPACES",
                    sk_begins_with="WS#",
                    index_name="GSI4",
                    limit=1000,
                )
                # Merge: GSI4 items first, then scan-only items
                seen = set()
                merged: list[Workspace] = []
                for ws in gsi4_workspaces:
                    if ws.id not in seen:
                        seen.add(ws.id)
                        merged.append(ws)
                for ws in workspaces:
                    if ws.id not in seen:
                        seen.add(ws.id)
                        merged.append(ws)
                workspaces = merged

            if len(workspaces) > limit:
                return workspaces[:limit], last_evaluated_key
            return workspaces, last_evaluated_key if len(workspaces) >= limit else None

        except ClientError as e:
            import structlog
            logger = structlog.get_logger()
            logger.error("Failed to list all workspaces", error=str(e))
            raise

    def list_by_agency(self, agency_id: str) -> list[Workspace]:
        """List workspaces by agency ID.

        Args:
            agency_id: The agency ID.

        Returns:
            List of workspaces.
        """
        workspaces, _ = self.query(
            pk=f"AGENCY#{agency_id}",
            sk_begins_with="WS#",
        )
        return workspaces
