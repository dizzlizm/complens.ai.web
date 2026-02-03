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
        GET    /workspaces/{workspace_id}/integrations
        PUT    /workspaces/{workspace_id}/integrations/twilio
        PUT    /workspaces/{workspace_id}/integrations/segment
        POST   /workspaces/{workspace_id}/integrations/twilio/test
        DELETE /workspaces/{workspace_id}/integrations/{provider}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        # Get auth context
        auth = get_auth_context(event)

        repo = WorkspaceRepository()

        # Integration routes
        if "/integrations" in path and workspace_id:
            require_workspace_access(auth, workspace_id)
            if "/twilio/test" in path and http_method == "POST":
                return test_twilio_connection(repo, workspace_id)
            elif "/twilio" in path and http_method == "PUT":
                return save_twilio_config(repo, workspace_id, event)
            elif "/segment" in path and http_method == "PUT":
                return save_segment_config(repo, workspace_id, event)
            elif http_method == "DELETE":
                return disconnect_integration(repo, workspace_id, path)
            elif http_method == "GET":
                return get_integration_status(repo, workspace_id)
            else:
                return error("Method not allowed", 405)

        # Standard workspace routes
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
    """List workspaces the user has access to. Auto-creates one if none exist."""
    workspaces = []

    # Get workspaces by user's agency
    if auth.agency_id:
        workspaces = repo.get_by_agency(auth.agency_id)

    # Also check workspaces where user_id is the agency (for users without explicit agency)
    if not workspaces and auth.user_id:
        workspaces = repo.get_by_agency(auth.user_id)

    # Also fetch workspaces by explicit workspace IDs if available
    if auth.workspace_ids:
        for ws_id in auth.workspace_ids:
            ws = repo.get_by_id(ws_id)
            if ws and ws not in workspaces:
                workspaces.append(ws)

    # Auto-create a default workspace if user has none
    if not workspaces and auth.user_id:
        logger.info("Auto-creating default workspace for user", user_id=auth.user_id)
        name = auth.email.split("@")[0] if auth.email else "My"
        workspace = Workspace(
            agency_id=auth.user_id,
            name=f"{name}'s Workspace",
            slug=f"workspace-{auth.user_id[:8]}",
        )
        workspace = repo.create_workspace(workspace)
        workspaces = [workspace]
        logger.info("Default workspace created", user_id=auth.user_id, workspace_id=workspace.id)

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
    # If user doesn't have an agency, use their user_id as the agency
    # This allows single users to create workspaces without explicit agency setup
    agency_id = auth.agency_id or auth.user_id
    if not agency_id:
        return error("Could not determine agency ID", 400)

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
        agency_id=agency_id,
        name=request.name,
        slug=request.slug,
        settings=request.settings,
        metadata=request.metadata,
    )

    workspace = repo.create_workspace(workspace)

    logger.info("Workspace created", workspace_id=workspace.id, agency_id=agency_id)

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


# ============================================================================
# Integration Handlers
# ============================================================================


def get_integration_status(repo: WorkspaceRepository, workspace_id: str) -> dict:
    """Get status of all integrations for a workspace."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    settings = workspace.settings

    # Build Twilio status
    twilio_connected = bool(settings.get("twilio_account_sid"))
    twilio_status = {"connected": twilio_connected}
    if twilio_connected:
        sid = settings.get("twilio_account_sid", "")
        twilio_status["account_sid_masked"] = sid[:6] + "..." + sid[-4:] if len(sid) > 10 else "****"
        twilio_status["phone_number"] = settings.get("twilio_phone_number", "")

    # Build Segment status
    segment_connected = bool(settings.get("segment_shared_secret"))
    segment_status = {"connected": segment_connected}
    if segment_connected:
        segment_status["webhook_url"] = f"/webhooks/segment/{workspace_id}"

    return success({
        "twilio": twilio_status,
        "segment": segment_status,
    })


def save_twilio_config(repo: WorkspaceRepository, workspace_id: str, event: dict) -> dict:
    """Save Twilio credentials to workspace settings."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    account_sid = body.get("account_sid", "").strip()
    auth_token = body.get("auth_token", "").strip()
    phone_number = body.get("phone_number", "").strip()

    if not account_sid or not auth_token or not phone_number:
        return error("account_sid, auth_token, and phone_number are required", 400)

    workspace.settings = {
        **workspace.settings,
        "twilio_account_sid": account_sid,
        "twilio_auth_token": auth_token,
        "twilio_phone_number": phone_number,
    }

    repo.update_workspace(workspace)

    logger.info("Twilio config saved", workspace_id=workspace_id)

    return success({"saved": True, "provider": "twilio"})


def save_segment_config(repo: WorkspaceRepository, workspace_id: str, event: dict) -> dict:
    """Save Segment shared secret to workspace settings."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    shared_secret = body.get("shared_secret", "").strip()

    if not shared_secret:
        return error("shared_secret is required", 400)

    workspace.settings = {
        **workspace.settings,
        "segment_shared_secret": shared_secret,
    }

    repo.update_workspace(workspace)

    logger.info("Segment config saved", workspace_id=workspace_id)

    return success({"saved": True, "provider": "segment"})


def test_twilio_connection(repo: WorkspaceRepository, workspace_id: str) -> dict:
    """Test Twilio credentials by verifying the account."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    account_sid = workspace.settings.get("twilio_account_sid")
    auth_token = workspace.settings.get("twilio_auth_token")

    if not account_sid or not auth_token:
        return error("Twilio credentials not configured", 400)

    try:
        from complens.services.twilio_service import TwilioService

        service = TwilioService(account_sid=account_sid, auth_token=auth_token)
        # Verify by fetching account info
        account = service.client.api.accounts(account_sid).fetch()

        return success({
            "success": True,
            "message": "Connection successful",
            "account_name": account.friendly_name,
        })

    except Exception as e:
        logger.warning("Twilio connection test failed", error=str(e), workspace_id=workspace_id)
        return success({
            "success": False,
            "message": f"Connection failed: {str(e)}",
        })


def disconnect_integration(repo: WorkspaceRepository, workspace_id: str, path: str) -> dict:
    """Disconnect an integration by removing its settings."""
    workspace = repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    if "/twilio" in path:
        provider = "twilio"
        prefix = "twilio_"
    elif "/segment" in path:
        provider = "segment"
        prefix = "segment_"
    else:
        return error("Unknown integration provider", 400)

    workspace.settings = {
        k: v for k, v in workspace.settings.items()
        if not k.startswith(prefix)
    }

    repo.update_workspace(workspace)

    logger.info("Integration disconnected", workspace_id=workspace_id, provider=provider)

    return success({"disconnected": True, "provider": provider})
