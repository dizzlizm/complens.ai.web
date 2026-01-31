"""Authentication context helpers."""

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

    # Try to get from lambda authorizer context
    if "lambda" in authorizer:
        context = authorizer["lambda"]

    user_id = context.get("userId") or context.get("user_id") or context.get("sub")

    if not user_id:
        logger.warning("No user ID in auth context", authorizer=authorizer)
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

    return AuthContext(
        user_id=user_id,
        email=email,
        agency_id=agency_id,
        workspace_ids=workspace_ids,
        is_admin=is_admin,
    )


def require_workspace_access(auth: AuthContext, workspace_id: str) -> None:
    """Ensure user has access to a workspace.

    Args:
        auth: Authentication context.
        workspace_id: Workspace ID to check access for.

    Raises:
        ForbiddenError: If user doesn't have access.
    """
    from complens.utils.exceptions import ForbiddenError

    if not auth.has_workspace_access(workspace_id):
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
