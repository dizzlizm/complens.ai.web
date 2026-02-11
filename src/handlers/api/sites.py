"""Sites API handler."""

import base64
import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.site import CreateSiteRequest, Site, UpdateSiteRequest
from complens.repositories.site import SiteRepository
from complens.services.feature_gate import FeatureGateError, count_resources, enforce_limit, get_workspace_plan
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle sites API requests.

    Routes:
        GET    /workspaces/{workspace_id}/sites
        POST   /workspaces/{workspace_id}/sites
        GET    /workspaces/{workspace_id}/sites/{site_id}
        PUT    /workspaces/{workspace_id}/sites/{site_id}
        DELETE /workspaces/{workspace_id}/sites/{site_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        site_id = path_params.get("site_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = SiteRepository()

        if http_method == "GET" and site_id:
            return get_site(repo, workspace_id, site_id)
        elif http_method == "GET":
            return list_sites(repo, workspace_id, event)
        elif http_method == "POST":
            return create_site(repo, workspace_id, event)
        elif http_method == "PUT" and site_id:
            return update_site(repo, workspace_id, site_id, event)
        elif http_method == "DELETE" and site_id:
            return delete_site(repo, workspace_id, site_id)
        else:
            return error("Method not allowed", 405)

    except FeatureGateError as e:
        return error(str(e), 403, error_code="FEATURE_GATE")
    except ValidationError as e:
        return validation_error(e.errors)
    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Sites handler error", error=str(e))
        return error("Internal server error", 500)


def list_sites(
    repo: SiteRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List sites in a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}
    limit = min(int(query_params.get("limit", 50)), 100)
    cursor = query_params.get("cursor")

    last_key = None
    if cursor:
        last_key = json.loads(base64.b64decode(cursor).decode())

    sites, next_key = repo.list_by_workspace(workspace_id, limit, last_key)

    next_cursor = None
    if next_key:
        next_cursor = base64.b64encode(json.dumps(next_key).encode()).decode()

    return success({
        "items": [s.model_dump(mode="json") for s in sites],
        "pagination": {
            "limit": limit,
            "next_cursor": next_cursor,
        },
    })


def get_site(
    repo: SiteRepository,
    workspace_id: str,
    site_id: str,
) -> dict:
    """Get a single site by ID."""
    site = repo.get_by_id(workspace_id, site_id)
    if not site:
        return not_found("Site", site_id)

    return success(site.model_dump(mode="json"))


def create_site(
    repo: SiteRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new site."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateSiteRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Enforce sites limit
    plan = get_workspace_plan(workspace_id)
    site_count = count_resources(repo.table, workspace_id, "SITE#")
    enforce_limit(plan, "sites", site_count)

    # Check for duplicate domain in this workspace
    existing = repo.get_by_domain(workspace_id, request.domain_name)
    if existing:
        return error(
            f"Site with domain '{request.domain_name}' already exists",
            409,
            error_code="DUPLICATE_DOMAIN",
        )

    site = Site(
        workspace_id=workspace_id,
        **request.model_dump(),
    )

    site = repo.create_site(site)

    logger.info("Site created", site_id=site.id, workspace_id=workspace_id, domain=site.domain_name)

    return created(site.model_dump(mode="json"))


def update_site(
    repo: SiteRepository,
    workspace_id: str,
    site_id: str,
    event: dict,
) -> dict:
    """Update an existing site."""
    site = repo.get_by_id(workspace_id, site_id)
    if not site:
        return not_found("Site", site_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateSiteRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Check for duplicate domain if changing
    if request.domain_name and request.domain_name != site.domain_name:
        existing = repo.get_by_domain(workspace_id, request.domain_name)
        if existing:
            return error(
                f"Site with domain '{request.domain_name}' already exists",
                409,
                error_code="DUPLICATE_DOMAIN",
            )

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(site, field, value)

    site = repo.update_site(site)

    logger.info("Site updated", site_id=site_id, workspace_id=workspace_id)

    return success(site.model_dump(mode="json"))


def delete_site(
    repo: SiteRepository,
    workspace_id: str,
    site_id: str,
) -> dict:
    """Delete a site."""
    deleted = repo.delete_site(workspace_id, site_id)
    if not deleted:
        return not_found("Site", site_id)

    logger.info("Site deleted", site_id=site_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": site_id})
