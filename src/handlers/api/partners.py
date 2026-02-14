"""Partners API handler for referral/channel partner tracking."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.partner import (
    CreatePartnerRequest,
    Partner,
    DEFAULT_PARTNER_STAGES,
    MovePartnerRequest,
    UpdatePartnerRequest,
)
from complens.repositories.partner import PartnerRepository
from complens.repositories.workspace import WorkspaceRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle partners API requests.

    Routes:
        GET    /workspaces/{workspace_id}/partners                  - List all partners
        POST   /workspaces/{workspace_id}/partners                  - Create partner
        GET    /workspaces/{workspace_id}/partners/{partner_id}     - Get partner
        PUT    /workspaces/{workspace_id}/partners/{partner_id}     - Update partner
        DELETE /workspaces/{workspace_id}/partners/{partner_id}     - Delete partner
        PUT    /workspaces/{workspace_id}/partners/{partner_id}/move - Move partner to stage
        GET    /workspaces/{workspace_id}/pipeline            - Get pipeline config
        PUT    /workspaces/{workspace_id}/pipeline            - Update pipeline config
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        resource = event.get("resource", "")
        workspace_id = path_params.get("workspace_id")
        partner_id = path_params.get("partner_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        # Pipeline config routes
        if resource.endswith("/pipeline"):
            ws_repo = WorkspaceRepository()
            if http_method == "GET":
                return get_pipeline_config(ws_repo, workspace_id)
            elif http_method == "PUT":
                return update_pipeline_config(ws_repo, workspace_id, event)
            else:
                return error("Method not allowed", 405)

        repo = PartnerRepository()

        # Move partner route
        if resource.endswith("/move") and partner_id:
            if http_method == "PUT":
                return move_partner(repo, workspace_id, partner_id, event)
            return error("Method not allowed", 405)

        # Standard CRUD routes
        if http_method == "GET" and partner_id:
            return get_partner(repo, workspace_id, partner_id)
        elif http_method == "GET":
            return list_partners(repo, workspace_id, event)
        elif http_method == "POST":
            return create_partner(repo, workspace_id, event)
        elif http_method == "PUT" and partner_id:
            return update_partner(repo, workspace_id, partner_id, event)
        elif http_method == "DELETE" and partner_id:
            return delete_partner(repo, workspace_id, partner_id)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Partners handler error", error=str(e))
        return error("Internal server error", 500)


# =============================================================================
# Partners CRUD
# =============================================================================


def list_partners(
    repo: PartnerRepository,
    workspace_id: str,
    event: dict | None = None,
) -> dict:
    """List partners for Kanban board or filtered by contact.

    Returns all partners plus pipeline stages and summary stats.
    Supports ?contact_id=X to filter partners linked to a specific contact.
    """
    # Check for contact_id filter
    query_params = (event or {}).get("queryStringParameters", {}) or {}
    contact_id = query_params.get("contact_id")

    all_partners: list[Partner] = []

    if contact_id:
        # Use GSI2 for efficient contact-scoped query
        partners, _ = repo.list_by_contact(contact_id, limit=50)
        all_partners = partners
    else:
        # Get all partners (paginate if needed)
        last_key = None
        while True:
            partners, next_key = repo.list_by_workspace(workspace_id, limit=200, last_key=last_key)
            all_partners.extend(partners)
            if not next_key:
                break
            last_key = next_key

    # Get pipeline stages from workspace settings
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    stages = DEFAULT_PARTNER_STAGES
    if workspace and workspace.settings.get("pipeline_stages"):
        stages = workspace.settings["pipeline_stages"]

    # Build summary
    total_value = sum(p.value for p in all_partners)
    by_stage: dict[str, dict[str, Any]] = {}
    for stage in stages:
        stage_partners = [p for p in all_partners if p.stage == stage]
        by_stage[stage] = {
            "count": len(stage_partners),
            "value": sum(p.value for p in stage_partners),
        }

    return success({
        "stages": stages,
        "partners": [p.model_dump(mode="json") for p in all_partners],
        "summary": {
            "total_partners": len(all_partners),
            "total_value": total_value,
            "by_stage": by_stage,
        },
    })


def get_partner(
    repo: PartnerRepository,
    workspace_id: str,
    partner_id: str,
) -> dict:
    """Get a single partner by ID."""
    partner = repo.get_by_id(workspace_id, partner_id)
    if not partner:
        return not_found("Partner", partner_id)

    return success(partner.model_dump(mode="json"))


def create_partner(
    repo: PartnerRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new partner."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreatePartnerRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    partner = Partner(
        workspace_id=workspace_id,
        **request.model_dump(),
    )

    partner = repo.create_partner(partner)

    logger.info("Partner created", partner_id=partner.id, workspace_id=workspace_id)

    return created(partner.model_dump(mode="json"))


def update_partner(
    repo: PartnerRepository,
    workspace_id: str,
    partner_id: str,
    event: dict,
) -> dict:
    """Update an existing partner."""
    partner = repo.get_by_id(workspace_id, partner_id)
    if not partner:
        return not_found("Partner", partner_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdatePartnerRequest.model_validate(body)
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
            setattr(partner, field, value)

    partner = repo.update_partner(partner)

    logger.info("Partner updated", partner_id=partner_id, workspace_id=workspace_id)

    return success(partner.model_dump(mode="json"))


def delete_partner(
    repo: PartnerRepository,
    workspace_id: str,
    partner_id: str,
) -> dict:
    """Delete a partner."""
    deleted = repo.delete_partner(workspace_id, partner_id)

    if not deleted:
        return not_found("Partner", partner_id)

    logger.info("Partner deleted", partner_id=partner_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": partner_id})


def move_partner(
    repo: PartnerRepository,
    workspace_id: str,
    partner_id: str,
    event: dict,
) -> dict:
    """Move a partner to a new stage with position."""
    partner = repo.get_by_id(workspace_id, partner_id)
    if not partner:
        return not_found("Partner", partner_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = MovePartnerRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    partner.stage = request.stage
    partner.position = request.position

    partner = repo.update_partner(partner)

    logger.info(
        "Partner moved",
        partner_id=partner_id,
        workspace_id=workspace_id,
        new_stage=request.stage,
        position=request.position,
    )

    return success(partner.model_dump(mode="json"))


# =============================================================================
# Pipeline Config
# =============================================================================


def get_pipeline_config(
    ws_repo: WorkspaceRepository,
    workspace_id: str,
) -> dict:
    """Get pipeline stages configuration."""
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    stages = workspace.settings.get("pipeline_stages", DEFAULT_PARTNER_STAGES)

    return success({"stages": stages})


def update_pipeline_config(
    ws_repo: WorkspaceRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Update pipeline stages configuration."""
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("Workspace", workspace_id)

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    stages = body.get("stages")
    if not stages or not isinstance(stages, list) or len(stages) < 2:
        return error("Pipeline must have at least 2 stages", 400)

    # Validate stage names
    for stage in stages:
        if not isinstance(stage, str) or not stage.strip():
            return error("Each stage must be a non-empty string", 400)

    # Clean stage names
    stages = [s.strip() for s in stages]

    # Update workspace settings
    settings = workspace.settings.copy()
    settings["pipeline_stages"] = stages
    workspace.settings = settings

    ws_repo.update_workspace(workspace)

    logger.info(
        "Pipeline config updated",
        workspace_id=workspace_id,
        stages=stages,
    )

    return success({"stages": stages})
