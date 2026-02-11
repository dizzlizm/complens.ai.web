"""Deals API handler for CRM pipeline management."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.deal import (
    CreateDealRequest,
    Deal,
    DEFAULT_PIPELINE_STAGES,
    MoveDealRequest,
    UpdateDealRequest,
)
from complens.repositories.deal import DealRepository
from complens.repositories.workspace import WorkspaceRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle deals API requests.

    Routes:
        GET    /workspaces/{workspace_id}/deals              - List all deals
        POST   /workspaces/{workspace_id}/deals              - Create deal
        GET    /workspaces/{workspace_id}/deals/{deal_id}     - Get deal
        PUT    /workspaces/{workspace_id}/deals/{deal_id}     - Update deal
        DELETE /workspaces/{workspace_id}/deals/{deal_id}     - Delete deal
        PUT    /workspaces/{workspace_id}/deals/{deal_id}/move - Move deal to stage
        GET    /workspaces/{workspace_id}/pipeline            - Get pipeline config
        PUT    /workspaces/{workspace_id}/pipeline            - Update pipeline config
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        resource = event.get("resource", "")
        workspace_id = path_params.get("workspace_id")
        deal_id = path_params.get("deal_id")

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

        repo = DealRepository()

        # Move deal route
        if resource.endswith("/move") and deal_id:
            if http_method == "PUT":
                return move_deal(repo, workspace_id, deal_id, event)
            return error("Method not allowed", 405)

        # Standard CRUD routes
        if http_method == "GET" and deal_id:
            return get_deal(repo, workspace_id, deal_id)
        elif http_method == "GET":
            return list_deals(repo, workspace_id)
        elif http_method == "POST":
            return create_deal(repo, workspace_id, event)
        elif http_method == "PUT" and deal_id:
            return update_deal(repo, workspace_id, deal_id, event)
        elif http_method == "DELETE" and deal_id:
            return delete_deal(repo, workspace_id, deal_id)
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
        logger.exception("Deals handler error", error=str(e))
        return error("Internal server error", 500)


# =============================================================================
# Deals CRUD
# =============================================================================


def list_deals(
    repo: DealRepository,
    workspace_id: str,
) -> dict:
    """List all deals for Kanban board.

    Returns all deals plus pipeline stages and summary stats.
    """
    # Get all deals (paginate if needed)
    all_deals: list[Deal] = []
    last_key = None
    while True:
        deals, next_key = repo.list_by_workspace(workspace_id, limit=200, last_key=last_key)
        all_deals.extend(deals)
        if not next_key:
            break
        last_key = next_key

    # Get pipeline stages from workspace settings
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    stages = DEFAULT_PIPELINE_STAGES
    if workspace and workspace.settings.get("pipeline_stages"):
        stages = workspace.settings["pipeline_stages"]

    # Build summary
    total_value = sum(d.value for d in all_deals)
    by_stage: dict[str, dict[str, Any]] = {}
    for stage in stages:
        stage_deals = [d for d in all_deals if d.stage == stage]
        by_stage[stage] = {
            "count": len(stage_deals),
            "value": sum(d.value for d in stage_deals),
        }

    return success({
        "stages": stages,
        "deals": [d.model_dump(mode="json") for d in all_deals],
        "summary": {
            "total_deals": len(all_deals),
            "total_value": total_value,
            "by_stage": by_stage,
        },
    })


def get_deal(
    repo: DealRepository,
    workspace_id: str,
    deal_id: str,
) -> dict:
    """Get a single deal by ID."""
    deal = repo.get_by_id(workspace_id, deal_id)
    if not deal:
        return not_found("Deal", deal_id)

    return success(deal.model_dump(mode="json"))


def create_deal(
    repo: DealRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new deal."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateDealRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    deal = Deal(
        workspace_id=workspace_id,
        **request.model_dump(),
    )

    deal = repo.create_deal(deal)

    logger.info("Deal created", deal_id=deal.id, workspace_id=workspace_id)

    return created(deal.model_dump(mode="json"))


def update_deal(
    repo: DealRepository,
    workspace_id: str,
    deal_id: str,
    event: dict,
) -> dict:
    """Update an existing deal."""
    deal = repo.get_by_id(workspace_id, deal_id)
    if not deal:
        return not_found("Deal", deal_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateDealRequest.model_validate(body)
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
            setattr(deal, field, value)

    deal = repo.update_deal(deal)

    logger.info("Deal updated", deal_id=deal_id, workspace_id=workspace_id)

    return success(deal.model_dump(mode="json"))


def delete_deal(
    repo: DealRepository,
    workspace_id: str,
    deal_id: str,
) -> dict:
    """Delete a deal."""
    deleted = repo.delete_deal(workspace_id, deal_id)

    if not deleted:
        return not_found("Deal", deal_id)

    logger.info("Deal deleted", deal_id=deal_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": deal_id})


def move_deal(
    repo: DealRepository,
    workspace_id: str,
    deal_id: str,
    event: dict,
) -> dict:
    """Move a deal to a new stage with position."""
    deal = repo.get_by_id(workspace_id, deal_id)
    if not deal:
        return not_found("Deal", deal_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = MoveDealRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    deal.stage = request.stage
    deal.position = request.position

    deal = repo.update_deal(deal)

    logger.info(
        "Deal moved",
        deal_id=deal_id,
        workspace_id=workspace_id,
        new_stage=request.stage,
        position=request.position,
    )

    return success(deal.model_dump(mode="json"))


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

    stages = workspace.settings.get("pipeline_stages", DEFAULT_PIPELINE_STAGES)

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
