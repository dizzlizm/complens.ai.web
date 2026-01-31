"""Workspaces API handler."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.workspace import CreateWorkspaceRequest, UpdateWorkspaceRequest, Workspace
from complens.repositories.workspace import WorkspaceRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle workspaces API requests.

    Routes:
        GET    /workspaces
        POST   /workspaces
        GET    /workspaces/{workspace_id}
        PUT    /workspaces/{workspace_id}
        DELETE /workspaces/{workspace_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        # Get auth context
        auth = get_auth_context(event)

        repo = WorkspaceRepository()

        # Route to appropriate handler
        if http_method == "GET" and workspace_id:
            require_workspace_access(auth, workspace_id)
            return get_workspace(repo, workspace_id)
        elif http_method == "GET":
            return list_workspaces(repo, auth)
        elif http_method == "POST":
            return create_workspace(repo, auth, event)
        elif http_method == "PUT" and workspace_id:
            require_workspace_access(auth, workspace_id)
            return update_workspace(repo, workspace_id, event)
        elif http_method == "DELETE" and workspace_id:
            require_workspace_access(auth, workspace_id)
            return delete_workspace(repo, auth, workspace_id)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Workspaces handler error", error=str(e))
        return error("Internal server error", 500)


def list_workspaces(repo: WorkspaceRepository, auth) -> dict:
    """List workspaces the user has access to."""
    # Get workspaces by user's agency
    if auth.agency_id:
        workspaces = repo.get_by_agency(auth.agency_id)
    elif auth.workspace_ids:
        # Fetch workspaces by IDs
        workspaces = []
        for ws_id in auth.workspace_ids:
            ws = repo.get_by_id(ws_id)
            if ws:
                workspaces.append(ws)
    else:
        workspaces = []

    return success({
        "items": [w.model_dump(mode="json") for w in workspaces],
    })


def get_workspace(repo: WorkspaceRepository, workspace_id: str) -> dict:
    """Get a single workspace by ID."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    return success(workspace.model_dump(mode="json"))


def create_workspace(repo: WorkspaceRepository, auth, event: dict) -> dict:
    """Create a new workspace."""
    if not auth.agency_id:
        return error("Agency ID required to create workspace", 400)

    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateWorkspaceRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Create workspace
    workspace = Workspace(
        agency_id=auth.agency_id,
        name=request.name,
        slug=request.slug,
        settings=request.settings,
        metadata=request.metadata,
    )

    workspace = repo.create_workspace(workspace)

    logger.info("Workspace created", workspace_id=workspace.id, agency_id=auth.agency_id)

    return created(workspace.model_dump(mode="json"))


def update_workspace(repo: WorkspaceRepository, workspace_id: str, event: dict) -> dict:
    """Update an existing workspace."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateWorkspaceRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Apply updates
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(workspace, field, value)

    workspace = repo.update_workspace(workspace)

    logger.info("Workspace updated", workspace_id=workspace_id)

    return success(workspace.model_dump(mode="json"))


def delete_workspace(repo: WorkspaceRepository, auth, workspace_id: str) -> dict:
    """Delete a workspace."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    deleted = repo.delete_workspace(workspace.agency_id, workspace_id)

    if not deleted:
        return not_found("Workspace", workspace_id)

    logger.info("Workspace deleted", workspace_id=workspace_id)

    return success({"deleted": True, "id": workspace_id})
