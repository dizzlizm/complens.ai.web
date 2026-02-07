"""Authentication context helpers.

Updated: 2026-02-02 for improved authorizer context extraction.
"""

from dataclasses import dataclass
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class AuthContext:
    """Authentication context extracted from API Gateway event.

    Contains user identity and authorization information.
    """

    user_id: str
    email: str | None = None
    agency_id: str | None = None
    workspace_ids: list[str] | None = None
    is_admin: bool = False
    is_super_admin: bool = False

    def has_workspace_access(self, workspace_id: str) -> bool:
        """Check if user has access to a specific workspace.

        Args:
            workspace_id: The workspace ID to check.

        Returns:
            True if user has access, False otherwise.
        """
        if self.is_admin:
            return True
        if not self.workspace_ids:
            return False
        return workspace_id in self.workspace_ids


def get_auth_context(event: dict[str, Any]) -> AuthContext:
    """Extract authentication context from API Gateway event.

    Args:
        event: API Gateway event dict.

    Returns:
        AuthContext with user information.

    Raises:
        ValueError: If authentication context cannot be extracted.
    """
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    # For Lambda authorizer responses, context is nested differently
    # depending on payload format version
    context = authorizer

    # Try to get from lambda authorizer context (HTTP API v2)
    if "lambda" in authorizer:
        context = authorizer["lambda"]

    # Try to get from JWT claims (Cognito authorizer)
    if "claims" in authorizer:
        context = authorizer["claims"]

    user_id = context.get("userId") or context.get("user_id") or context.get("sub")

    # Also check principalId as fallback (set by Lambda authorizer)
    if not user_id:
        user_id = request_context.get("authorizer", {}).get("principalId")

    if not user_id:
        logger.warning(
            "No user ID in auth context",
            authorizer=authorizer,
            request_context_keys=list(request_context.keys()),
        )
        raise ValueError("No user ID in authentication context")

    email = context.get("email")
    agency_id = context.get("agencyId") or context.get("agency_id")

    # Parse workspace IDs (may be comma-separated string or list)
    workspace_ids_raw = context.get("workspaceIds") or context.get("workspace_ids")
    workspace_ids = None

    if workspace_ids_raw:
        if isinstance(workspace_ids_raw, str):
            workspace_ids = [ws.strip() for ws in workspace_ids_raw.split(",") if ws.strip()]
        elif isinstance(workspace_ids_raw, list):
            workspace_ids = workspace_ids_raw

    is_admin = context.get("isAdmin", False) or context.get("is_admin", False)
    if isinstance(is_admin, str):
        is_admin = is_admin.lower() == "true"

    is_super_admin = context.get("isSuperAdmin", False) or context.get("is_super_admin", False)
    if isinstance(is_super_admin, str):
        is_super_admin = is_super_admin.lower() == "true"

    return AuthContext(
        user_id=user_id,
        email=email,
        agency_id=agency_id,
        workspace_ids=workspace_ids,
        is_admin=is_admin,
        is_super_admin=is_super_admin,
    )


def require_super_admin(auth: AuthContext) -> None:
    """Ensure user is a super admin.

    Args:
        auth: Authentication context.

    Raises:
        ForbiddenError: If user is not a super admin.
    """
    from complens.utils.exceptions import ForbiddenError

    if not auth.is_super_admin:
        logger.warning(
            "Super admin access denied",
            user_id=auth.user_id,
        )
        raise ForbiddenError(
            message="Super admin access required",
            resource_type="Admin",
            action="access",
        )


def require_workspace_access(auth: AuthContext, workspace_id: str) -> None:
    """Ensure user has access to a workspace.

    Args:
        auth: Authentication context.
        workspace_id: Workspace ID to check access for.

    Raises:
        ForbiddenError: If user doesn't have access.
    """
    from complens.repositories.workspace import WorkspaceRepository
    from complens.utils.exceptions import ForbiddenError

    # First check explicit workspace access
    if auth.has_workspace_access(workspace_id):
        return

    # Check if user owns the workspace (agency_id matches user_id or agency_id)
    repo = WorkspaceRepository()
    workspace = repo.get_by_id(workspace_id)
    if workspace:
        # User owns this workspace if their user_id or agency_id matches the workspace's agency_id
        if workspace.agency_id == auth.user_id:
            return
        if auth.agency_id and workspace.agency_id == auth.agency_id:
            return

    logger.warning(
        "Workspace access denied",
        user_id=auth.user_id,
        workspace_id=workspace_id,
        user_workspaces=auth.workspace_ids,
    )
    raise ForbiddenError(
        message=f"You don't have access to workspace '{workspace_id}'",
        resource_type="Workspace",
        action="access",
    )


def get_workspace_id_from_path(event: dict[str, Any]) -> str:
    """Extract workspace_id from path parameters.

    Args:
        event: API Gateway event.

    Returns:
        Workspace ID.

    Raises:
        ValueError: If workspace_id not in path.
    """
    path_params = event.get("pathParameters", {}) or {}
    workspace_id = path_params.get("workspace_id")

    if not workspace_id:
        raise ValueError("workspace_id not found in path parameters")

    return workspace_id


def get_user_workspaces(claims: dict[str, Any]) -> list[str]:
    """Extract workspace IDs from Cognito JWT claims.

    This is a simplified helper for handlers that just need to check
    workspace access without the full AuthContext.

    Args:
        claims: JWT claims from Cognito authorizer.

    Returns:
        List of workspace IDs the user has access to.
    """
    # For Cognito, the sub claim is the user_id
    user_id = claims.get("sub", "")

    # Custom claims might include workspace access
    workspace_ids_raw = claims.get("custom:workspaces") or claims.get("workspaces")

    if workspace_ids_raw:
        if isinstance(workspace_ids_raw, str):
            return [ws.strip() for ws in workspace_ids_raw.split(",") if ws.strip()]
        elif isinstance(workspace_ids_raw, list):
            return workspace_ids_raw

    # If no explicit workspaces in claims, look up from database
    # For now, return user_id as a "workspace" - the handler should
    # verify actual workspace ownership
    if user_id:
        # Query workspaces owned by this user
        try:
            from complens.repositories.workspace import WorkspaceRepository
            repo = WorkspaceRepository()
            workspaces = repo.list_by_agency(user_id)
            return [ws.id for ws in workspaces]
        except Exception as e:
            logger.warning("Failed to lookup user workspaces", error=str(e))
            return []

    return []
