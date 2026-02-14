"""Sites API handler."""

import base64
import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.site import CreateSiteRequest, Site, UpdateSiteRequest
from complens.repositories.page import PageRepository
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
    """List sites in a workspace.

    Auto-creates a default "My Site" if the workspace has no sites yet.
    This ensures free-tier users can immediately access pages without
    needing to verify a domain first.
    """
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

    # Enrich each site with its primary page info
    items = []
    for s in sites:
        site_data = s.model_dump(mode="json")
        site_data["primary_page"] = _get_primary_page(workspace_id, s.id)
        items.append(site_data)

    return success({
        "items": items,
        "pagination": {
            "limit": limit,
            "next_cursor": next_cursor,
        },
    })


def _ensure_default_site(repo: SiteRepository, workspace_id: str) -> Site | None:
    """Create a default site for a workspace and adopt any unassigned pages.

    Free-tier users get one site automatically so they can start building
    pages immediately without needing to verify a custom domain.
    """
    try:
        site = Site(
            workspace_id=workspace_id,
            domain_name="",
            name="My Site",
        )
        site = repo.create_site(site)
        logger.info("Default site auto-created", site_id=site.id, workspace_id=workspace_id)

        # Adopt any unassigned pages (e.g., demo page from onboarding)
        _assign_orphan_pages(workspace_id, site.id)

        # Ensure the site has at least one page
        _ensure_site_has_page(workspace_id, site.id, site.name)

        return site
    except Exception as e:
        logger.error("Failed to auto-create default site", error=str(e), workspace_id=workspace_id)
        return None


def _assign_orphan_pages(workspace_id: str, site_id: str) -> None:
    """Assign pages with no site_id to the given site."""
    try:
        page_repo = PageRepository()
        pages, _ = page_repo.list_by_workspace(workspace_id, limit=100)
        adopted = 0
        for page in pages:
            if not page.site_id:
                page.site_id = site_id
                page.update_timestamp()
                page_repo.update_page(page)
                adopted += 1
        if adopted:
            logger.info("Orphan pages adopted", count=adopted, site_id=site_id, workspace_id=workspace_id)
    except Exception as e:
        logger.warning("Failed to adopt orphan pages", error=str(e))


def _ensure_site_has_page(workspace_id: str, site_id: str, site_name: str) -> None:
    """Ensure a site has at least one page. Creates one if empty."""
    try:
        page_repo = PageRepository()
        pages, _ = page_repo.list_by_site(workspace_id, site_id, limit=1)
        if pages:
            return  # Already has pages

        from complens.models.page import Page
        slug = site_name.lower().replace(" ", "-").replace("_", "-")
        slug = "".join(c for c in slug if c.isalnum() or c == "-")[:50] or "page"
        page = Page(
            workspace_id=workspace_id,
            site_id=site_id,
            name=site_name,
            slug=slug,
            status="draft",
        )
        page_repo.create_page(page)
        logger.info("Auto-created page for site", page_id=page.id, site_id=site_id)
    except Exception as e:
        logger.warning("Failed to auto-create page for site", error=str(e), site_id=site_id)


def _get_primary_page(workspace_id: str, site_id: str) -> dict | None:
    """Get the primary (first) page for a site, returning summary info."""
    try:
        page_repo = PageRepository()
        pages, _ = page_repo.list_by_site(workspace_id, site_id, limit=1)
        if not pages:
            return None
        page = pages[0]
        return {
            "id": page.id,
            "name": page.name,
            "slug": page.slug,
            "status": getattr(page, "status", "draft"),
            "subdomain": getattr(page, "subdomain", None),
        }
    except Exception:
        return None


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

    # Check for duplicate domain in this workspace (skip for sites with no domain)
    existing = repo.get_by_domain(workspace_id, request.domain_name) if request.domain_name else None
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

    # Auto-create a page for the new site
    _ensure_site_has_page(workspace_id, site.id, site.name)

    logger.info("Site created", site_id=site.id, workspace_id=workspace_id, domain=site.domain_name)

    result = site.model_dump(mode="json")
    result["primary_page"] = _get_primary_page(workspace_id, site.id)
    return created(result)


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
