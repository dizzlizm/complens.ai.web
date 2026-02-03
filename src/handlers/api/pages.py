"""Pages API handler (admin, authenticated).

Handles both page CRUD and nested forms/workflows under pages.

TODO: [TECH-DEBT] - This file is 1,624 lines and handles too many concerns
Details: Current file combines page CRUD, form management, workflow integration, 
and block configuration in one handler. This makes the code difficult to:
- Test (too many dependencies and scenarios)
- Understand (large surface area)
- Modify (changes affect unrelated functionality)
- Maintain (merged concerns create tight coupling)

Recommended refactoring into separate handlers:
1. pages_handler.py - Page CRUD operations (create, read, update, delete)
2. page_forms_handler.py - Form management within pages
3. page_blocks_handler.py - Block configuration and management
4. page_workflows_handler.py - Workflow integration with pages

This refactoring would:
- Reduce each file to ~200-300 lines
- Enable focused testing per concern
- Improve readability and maintainability
- Allow parallel development of features

Severity: Medium - impacts development velocity and code quality
Estimated effort: 3-4 days for experienced developer
"""

import json
import re
import uuid
from typing import Any

import boto3
import structlog
from pydantic import BaseModel as PydanticBaseModel, Field, ValidationError as PydanticValidationError

from complens.models.form import (
    CreateFormRequest,
    Form,
    FormField,
    FormFieldType,
    UpdateFormRequest,
)
from complens.models.page import (
    ChatConfig,
    CreatePageRequest,
    Page,
    PageBlock,
    PageStatus,
    RESERVED_SUBDOMAINS,
    UpdatePageRequest,
)
from complens.models.workflow import (
    CreateWorkflowRequest,
    UpdateWorkflowRequest,
    Workflow,
    WorkflowEdge,
    WorkflowStatus,
)
from complens.models.workflow_node import WorkflowNode
from complens.repositories.form import FormRepository
from complens.repositories.page import PageRepository
from complens.repositories.workflow import WorkflowRepository
from complens.services.cdn_service import invalidate_page_cache
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

import os

STAGE = os.environ.get("STAGE", "dev")

logger = structlog.get_logger()


class GeneratePageRequest(PydanticBaseModel):
    """Request to generate page content from source material."""

    source_content: str = Field(..., min_length=10, max_length=50000, description="Source content to generate page from")
    template: str = Field(default="professional", description="Template ID: professional, bold, or minimal")
    target_audience: str | None = Field(None, max_length=500, description="Who is the target audience?")
    call_to_action: str | None = Field(None, max_length=200, description="Primary call to action (e.g., 'Book a call', 'Get started')")
    create_form: bool = Field(default=True, description="Auto-create a lead capture form for the page")


class AutomationConfig(PydanticBaseModel):
    """Automation configuration for create-complete endpoint."""

    send_welcome_email: bool = Field(default=True, description="Send welcome email to lead")
    notify_owner: bool = Field(default=True, description="Notify page owner via email")
    owner_email: str | None = Field(None, description="Owner email for notifications")
    welcome_message: str | None = Field(None, description="Custom welcome email message")
    add_tags: list[str] = Field(default_factory=list, description="Tags to add to contact")


class SynthesizedBlockInput(PydanticBaseModel):
    """A pre-synthesized block from the synthesis engine."""

    id: str
    type: str
    order: int
    width: int = Field(default=4, ge=1, le=4)
    config: dict = Field(default_factory=dict)


class SynthesizedFormConfig(PydanticBaseModel):
    """Form configuration from synthesis engine."""

    name: str = Field(default="Contact Form")
    fields: list[dict] = Field(default_factory=list)
    submit_button_text: str = Field(default="Get Started")
    success_message: str = Field(default="Thanks! We'll be in touch shortly.")
    add_tags: list[str] = Field(default_factory=lambda: ["lead", "website"])


class SynthesizedWorkflowConfig(PydanticBaseModel):
    """Workflow configuration from synthesis engine."""

    name: str = Field(default="Lead Automation")
    trigger_type: str = Field(default="trigger_form_submitted")
    send_welcome_email: bool = Field(default=True)
    notify_owner: bool = Field(default=True)
    owner_email: str | None = Field(default=None)
    welcome_message: str | None = Field(default=None)
    add_tags: list[str] = Field(default_factory=list)


class CreateCompleteRequest(PydanticBaseModel):
    """Request to create a complete marketing package (page + form + workflow).

    When page_id is provided, updates the existing page instead of creating a new one.

    Can accept either:
    1. Traditional `content` dict for legacy block building
    2. `synthesized_blocks` for pre-built blocks from synthesis engine
    """

    # Page info - name/slug are optional when updating existing page
    name: str | None = Field(None, min_length=1, max_length=255, description="Page name")
    slug: str | None = Field(None, min_length=1, max_length=100, description="URL slug")
    subdomain: str | None = Field(None, description="Optional subdomain to claim")

    # Update mode - if provided, update this page instead of creating new
    page_id: str | None = Field(None, description="Existing page ID to update (update mode)")

    # Generated content from wizard (legacy approach)
    content: dict = Field(default_factory=dict, description="Generated content from AI wizard")
    style: str = Field(default="professional", description="Visual style")
    colors: dict = Field(
        default_factory=lambda: {"primary": "#6366f1", "secondary": "#818cf8", "accent": "#c7d2fe"},
        description="Color scheme"
    )

    # NEW: Pre-synthesized blocks from synthesis engine
    synthesized_blocks: list[SynthesizedBlockInput] | None = Field(
        None, description="Pre-built blocks from synthesis engine (overrides content-based building)"
    )

    # NEW: Synthesis-generated form config
    synthesized_form_config: SynthesizedFormConfig | None = Field(
        None, description="Form config from synthesis engine"
    )

    # NEW: Synthesis-generated workflow config
    synthesized_workflow_config: SynthesizedWorkflowConfig | None = Field(
        None, description="Workflow config from synthesis engine"
    )

    # Form inclusion
    include_form: bool = Field(default=True, description="Include lead capture form")

    # Chat widget
    include_chat: bool = Field(default=True, description="Include AI chat widget")

    # Automation settings (legacy - used if synthesized_workflow_config not provided)
    automation: AutomationConfig = Field(default_factory=AutomationConfig, description="Automation workflow config")

    # Replace existing page if slug conflicts (only for create mode)
    replace_existing: bool = Field(default=False, description="Replace existing page with same slug")

    # Business name for chat/workflow naming
    business_name: str | None = Field(None, description="Business name from synthesis")


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle pages API requests.

    Routes:
        GET    /workspaces/{workspace_id}/pages
        POST   /workspaces/{workspace_id}/pages
        POST   /workspaces/{workspace_id}/pages/generate  - AI generate page content
        POST   /workspaces/{workspace_id}/pages/create-complete  - Create page + form + workflow
        GET    /workspaces/{workspace_id}/pages/check-subdomain?subdomain=xxx
        GET    /workspaces/{workspace_id}/pages/{page_id}
        PUT    /workspaces/{workspace_id}/pages/{page_id}
        DELETE /workspaces/{workspace_id}/pages/{page_id}

        # Nested forms endpoints
        GET    /workspaces/{workspace_id}/pages/{page_id}/forms
        POST   /workspaces/{workspace_id}/pages/{page_id}/forms
        GET    /workspaces/{workspace_id}/pages/{page_id}/forms/{form_id}
        PUT    /workspaces/{workspace_id}/pages/{page_id}/forms/{form_id}
        DELETE /workspaces/{workspace_id}/pages/{page_id}/forms/{form_id}

        # Nested workflows endpoints
        GET    /workspaces/{workspace_id}/pages/{page_id}/workflows
        POST   /workspaces/{workspace_id}/pages/{page_id}/workflows
        GET    /workspaces/{workspace_id}/pages/{page_id}/workflows/{workflow_id}
        PUT    /workspaces/{workspace_id}/pages/{page_id}/workflows/{workflow_id}
        DELETE /workspaces/{workspace_id}/pages/{page_id}/workflows/{workflow_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        page_id = path_params.get("page_id")
        form_id = path_params.get("form_id")
        workflow_id = path_params.get("workflow_id")

        logger.info("Pages request", method=http_method, path=path, workspace_id=workspace_id, page_id=page_id)

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = PageRepository()

        # Route to appropriate handler
        # Check for nested forms endpoints first
        if "/forms" in path and page_id:
            return handle_page_forms(event, http_method, workspace_id, page_id, form_id)

        # Check for nested workflows endpoints
        if "/workflows" in path and page_id:
            return handle_page_workflows(event, http_method, workspace_id, page_id, workflow_id)

        # Check for /generate and /create-complete endpoints (before page_id check)
        # Use 'in' check to handle trailing slashes or query string artifacts
        if http_method == "POST" and "/pages/generate" in path and "create-complete" not in path:
            return generate_page_content(event)
        elif http_method == "POST" and "/pages/create-complete" in path:
            logger.info("Routing to create_complete_page", path=path)
            return create_complete_page(repo, workspace_id, event)
        elif http_method == "GET" and "/pages/check-subdomain" in path:
            return check_subdomain_availability(repo, event)
        elif http_method == "GET" and page_id:
            return get_page(repo, workspace_id, page_id)
        elif http_method == "GET":
            return list_pages(repo, workspace_id, event)
        elif http_method == "POST":
            return create_page(repo, workspace_id, event)
        elif http_method == "PUT" and page_id:
            return update_page(repo, workspace_id, page_id, event)
        elif http_method == "DELETE" and page_id:
            return delete_page(repo, workspace_id, page_id)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Pages handler error", error=str(e))
        return error("Internal server error", 500)


def list_pages(
    repo: PageRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List pages in a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)
    status_filter = query_params.get("status")

    status = None
    if status_filter:
        try:
            status = PageStatus(status_filter)
        except ValueError:
            return error(f"Invalid status: {status_filter}", 400)

    pages, next_key = repo.list_by_workspace(workspace_id, status=status, limit=limit)

    return success({
        "items": [p.model_dump(mode="json") for p in pages],
        "pagination": {
            "limit": limit,
        },
    })


def get_page(
    repo: PageRepository,
    workspace_id: str,
    page_id: str,
) -> dict:
    """Get a single page by ID."""
    page = repo.get_by_id(workspace_id, page_id)
    if not page:
        return not_found("Page", page_id)

    return success(page.model_dump(mode="json"))


def create_page(
    repo: PageRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new page."""
    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Create page request", workspace_id=workspace_id, body=body)
        request = CreatePageRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Page request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON body", error=str(e))
        return error("Invalid JSON body", 400)

    # Check if slug already exists
    if repo.slug_exists(workspace_id, request.slug):
        return error(f"Slug '{request.slug}' is already in use", 400, error_code="SLUG_EXISTS")

    # Convert blocks from request format
    blocks = []
    if request.blocks:
        for block_data in request.blocks:
            # Build block dict, only include id if provided
            block_dict = {
                "type": block_data.type,
                "config": block_data.config,
                "order": block_data.order,
                # Include 12-column layout fields
                "row": block_data.row,
                "colSpan": block_data.colSpan,
                "colStart": block_data.colStart,
            }
            if block_data.id:
                block_dict["id"] = block_data.id
            if hasattr(block_data, 'width'):
                block_dict["width"] = block_data.width
            blocks.append(PageBlock.model_validate(block_dict))

    # Create page
    page = Page(
        workspace_id=workspace_id,
        name=request.name,
        slug=request.slug,
        headline=request.headline,
        subheadline=request.subheadline,
        hero_image_url=request.hero_image_url,
        body_content=request.body_content,
        blocks=blocks,
        chat_config=request.chat_config or ChatConfig(),
        form_ids=request.form_ids or [],
        primary_color=request.primary_color or "#6366f1",
        meta_title=request.meta_title,
        meta_description=request.meta_description,
    )

    page = repo.create_page(page)

    logger.info("Page created", page_id=page.id, workspace_id=workspace_id, slug=page.slug)

    return created(page.model_dump(mode="json"))


def update_page(
    repo: PageRepository,
    workspace_id: str,
    page_id: str,
    event: dict,
) -> dict:
    """Update an existing page."""
    # Get existing page
    page = repo.get_by_id(workspace_id, page_id)
    if not page:
        return not_found("Page", page_id)

    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Update page request", page_id=page_id, body=body)
        request = UpdatePageRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Update request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Check slug uniqueness if changing
    if request.slug is not None and request.slug != page.slug:
        if repo.slug_exists(workspace_id, request.slug, exclude_page_id=page_id):
            return error(f"Slug '{request.slug}' is already in use", 400, error_code="SLUG_EXISTS")

    # Check subdomain uniqueness if changing (globally unique across all workspaces)
    if request.subdomain is not None:
        subdomain = request.subdomain.lower() if request.subdomain else None
        if subdomain and subdomain != (page.subdomain or "").lower():
            # Check reserved subdomains
            if subdomain in RESERVED_SUBDOMAINS:
                return error(f"Subdomain '{subdomain}' is reserved", 400, error_code="SUBDOMAIN_RESERVED")
            # Check if already taken
            if repo.subdomain_exists(subdomain, exclude_page_id=page_id):
                return error(f"Subdomain '{subdomain}' is already taken", 400, error_code="SUBDOMAIN_EXISTS")

    # Apply updates
    if request.name is not None:
        page.name = request.name
    if request.slug is not None:
        page.slug = request.slug
    if request.status is not None:
        page.status = request.status
    if request.headline is not None:
        page.headline = request.headline
    if request.subheadline is not None:
        page.subheadline = request.subheadline
    if request.hero_image_url is not None:
        page.hero_image_url = request.hero_image_url
    if request.body_content is not None:
        page.body_content = request.body_content
    if request.chat_config is not None:
        page.chat_config = request.chat_config
    if request.form_ids is not None:
        page.form_ids = request.form_ids
    if request.primary_color is not None:
        page.primary_color = request.primary_color
    if request.theme is not None:
        page.theme = request.theme
    if request.custom_css is not None:
        page.custom_css = request.custom_css
    if request.meta_title is not None:
        page.meta_title = request.meta_title
    if request.meta_description is not None:
        page.meta_description = request.meta_description
    if request.subdomain is not None:
        # Allow setting to empty string to clear subdomain
        page.subdomain = request.subdomain.lower() if request.subdomain else None
    if request.custom_domain is not None:
        page.custom_domain = request.custom_domain
    if request.blocks is not None:
        # Convert blocks from request format
        blocks = []
        for i, block_data in enumerate(request.blocks):
            # Build block dict, only include id if provided
            block_dict = {
                "type": block_data.type,
                "config": block_data.config,
                "order": block_data.order,
                "width": block_data.width,
                # Include 12-column layout fields
                "row": block_data.row,
                "colSpan": block_data.colSpan,
                "colStart": block_data.colStart,
            }
            if block_data.id:
                block_dict["id"] = block_data.id
            blocks.append(PageBlock.model_validate(block_dict))
        page.blocks = blocks
        logger.info("Saving blocks", page_id=page_id, block_count=len(blocks), blocks=[b.model_dump() for b in blocks])

    # Save
    page = repo.update_page(page)

    # Invalidate CDN cache if page has subdomain or custom domain
    if page.subdomain or page.custom_domain:
        try:
            invalidation_result = invalidate_page_cache(
                subdomain=page.subdomain,
                custom_domain=page.custom_domain,
                page_id=page_id,
            )
            logger.info(
                "CDN cache invalidated",
                page_id=page_id,
                subdomain=page.subdomain,
                custom_domain=page.custom_domain,
                result=invalidation_result,
            )
        except Exception as e:
            # Log but don't fail the request - cache will expire naturally
            logger.warning(
                "Failed to invalidate CDN cache",
                page_id=page_id,
                error=str(e),
            )

    # Serialize for response
    response_data = page.model_dump(mode="json")
    logger.info(
        "Page updated",
        page_id=page_id,
        workspace_id=workspace_id,
        block_count=len(page.blocks),
        response_has_blocks="blocks" in response_data,
    )

    return success(response_data)


def delete_page(
    repo: PageRepository,
    workspace_id: str,
    page_id: str,
) -> dict:
    """Delete a page."""
    deleted = repo.delete_page(workspace_id, page_id)

    if not deleted:
        return not_found("Page", page_id)

    logger.info("Page deleted", page_id=page_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": page_id})


def check_subdomain_availability(repo: PageRepository, event: dict) -> dict:
    """Check if a subdomain is available.

    Query params:
        subdomain: The subdomain to check
        exclude_page_id: Optional page ID to exclude (for updates)
    """
    query_params = event.get("queryStringParameters", {}) or {}
    subdomain = query_params.get("subdomain", "").lower().strip()
    exclude_page_id = query_params.get("exclude_page_id")

    if not subdomain:
        return error("Subdomain parameter is required", 400)

    # Check format
    import re
    if not re.match(r'^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$', subdomain):
        return success({
            "subdomain": subdomain,
            "available": False,
            "reason": "invalid_format",
            "message": "Subdomain must be 3-63 characters, lowercase letters, numbers, and hyphens only",
        })

    # Check reserved
    if subdomain in RESERVED_SUBDOMAINS:
        return success({
            "subdomain": subdomain,
            "available": False,
            "reason": "reserved",
            "message": f"'{subdomain}' is a reserved subdomain",
        })

    # Check if taken
    if repo.subdomain_exists(subdomain, exclude_page_id=exclude_page_id):
        return success({
            "subdomain": subdomain,
            "available": False,
            "reason": "taken",
            "message": f"'{subdomain}' is already taken",
        })

    # Build the URL based on stage
    if STAGE == "prod":
        url = f"https://{subdomain}.complens.ai"
    else:
        url = f"https://{subdomain}.{STAGE}.complens.ai"

    return success({
        "subdomain": subdomain,
        "available": True,
        "url": url,
    })


def create_complete_page(
    repo: PageRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create or update a complete marketing package: page + form + workflow.

    This is the main endpoint for the AI wizard. It creates/updates:
    1. A page with blocks based on the generated content
    2. A lead capture form (if include_form is True)
    3. An automation workflow (form submission → emails → tag contact)

    All three are linked together and ready to use.

    When page_id is provided, updates the existing page instead of creating a new one.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        logger.info(
            "Create complete page request",
            workspace_id=workspace_id,
            body_keys=list(body.keys()),
            has_name=bool(body.get("name")),
            has_slug=bool(body.get("slug")),
            has_page_id=bool(body.get("page_id")),
            has_content=bool(body.get("content")),
            content_keys=list(body.get("content", {}).keys()) if isinstance(body.get("content"), dict) else None,
        )
        request = CreateCompleteRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning(
            "Create complete request validation failed",
            errors=e.errors(),
            body_keys=list(body.keys()) if isinstance(body, dict) else None,
        )
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON body", error=str(e))
        return error("Invalid JSON body", 400)

    # UPDATE MODE: If page_id is provided, update existing page
    if request.page_id:
        return _update_complete_page(repo, workspace_id, request)

    # CREATE MODE: Validate required fields for create
    if not request.name or not request.slug:
        return error("name and slug are required when creating a new page", 400)

    # Check if slug already exists
    existing_page = repo.get_by_slug(workspace_id, request.slug)
    if existing_page:
        if not request.replace_existing:
            return error(f"Slug '{request.slug}' is already in use", 400, error_code="SLUG_EXISTS")

        # Delete existing page and its associated resources
        logger.info("Replacing existing page", page_id=existing_page.id, slug=request.slug)

        # Delete associated forms
        form_repo = FormRepository()
        existing_forms, _ = form_repo.list_by_page(existing_page.id)
        for form in existing_forms:
            form_repo.delete_form(workspace_id, form.id)
            logger.info("Deleted existing form", form_id=form.id)

        # Delete associated workflows
        workflow_repo = WorkflowRepository()
        existing_workflows, _ = workflow_repo.list_by_page(existing_page.id)
        for workflow in existing_workflows:
            workflow_repo.delete_workflow(workspace_id, workflow.id)
            logger.info("Deleted existing workflow", workflow_id=workflow.id)

        # Delete the page itself
        repo.delete_page(workspace_id, existing_page.id)
        logger.info("Deleted existing page", page_id=existing_page.id)

    # Check subdomain if provided
    if request.subdomain:
        subdomain = request.subdomain.lower()
        if subdomain in RESERVED_SUBDOMAINS:
            return error(f"Subdomain '{subdomain}' is reserved", 400, error_code="SUBDOMAIN_RESERVED")
        if repo.subdomain_exists(subdomain):
            return error(f"Subdomain '{subdomain}' is already taken", 400, error_code="SUBDOMAIN_EXISTS")

    # Extract content from wizard
    content = request.content.get("content", request.content) if request.content else {}
    business_info = request.content.get("business_info", {}) if request.content else {}
    colors = request.colors

    # Determine business name
    business_name = request.business_name or business_info.get("business_name") or request.name or "Business"

    # Build page blocks - use synthesized blocks if provided, otherwise legacy approach
    if request.synthesized_blocks:
        logger.info("Using synthesized blocks", block_count=len(request.synthesized_blocks))
        blocks = [
            PageBlock(
                id=sb.id,
                type=sb.type,
                order=sb.order,
                width=sb.width,
                config=sb.config,
            )
            for sb in request.synthesized_blocks
        ]
    else:
        blocks = _build_blocks_from_content(content, business_info, request.style, colors)

    # Create the page
    headline = ""
    if content.get("headlines") and len(content["headlines"]) > 0:
        headline = content["headlines"][0]

    page = Page(
        workspace_id=workspace_id,
        name=request.name,
        slug=request.slug,
        subdomain=request.subdomain.lower() if request.subdomain else None,
        headline=headline,
        subheadline=content.get("hero_subheadline", content.get("tagline", "")),
        blocks=blocks,
        primary_color=colors.get("primary", "#6366f1"),
        chat_config=ChatConfig(
            enabled=request.include_chat,
            position="bottom-right",
            initial_message=f"Hi! How can I help you learn more about {business_info.get('business_name', request.name)}?",
            ai_persona=f"Helpful assistant for {business_info.get('business_name', request.name)}",
        ),
        meta_title=request.name,
        meta_description=content.get("hero_subheadline", content.get("tagline", "")),
        status=PageStatus.PUBLISHED,
    )

    page = repo.create_page(page)
    logger.info("Page created for complete package", page_id=page.id, workspace_id=workspace_id)

    # Auto-generate OG (social sharing) image — abstract design using page colors
    try:
        from complens.services.image_generator import ImageGeneratorService

        og_color_desc = f"primary color {colors.get('primary', '#6366f1')}"
        if colors.get("secondary"):
            og_color_desc += f", secondary color {colors['secondary']}"
        if colors.get("accent"):
            og_color_desc += f", accent color {colors['accent']}"

        style_desc = request.style or "professional"
        business_desc = business_info.get("business_name", request.name)
        industry = business_info.get("industry", "")
        industry_hint = f" in the {industry} industry" if industry else ""

        og_prompt = (
            f"Abstract {style_desc} geometric design with smooth gradients using {og_color_desc}. "
            f"Modern, clean composition suitable for a social media sharing card for {business_desc}{industry_hint}. "
            f"No text, no logos, no words. Subtle shapes, flowing lines, and professional feel. "
            f"Wide landscape format, high quality."
        )[:512]  # Titan 512 char limit

        img_service = ImageGeneratorService()
        og_result = img_service.generate_and_upload(
            prompt=og_prompt,
            folder=f"og-images/{workspace_id}",
            width=1024,   # Closest Titan-supported size to 1200x630
            height=512,
        )

        if "image_url" in og_result:
            page.og_image_url = og_result["image_url"]
            repo.update_page(page)
            logger.info("OG image generated", page_id=page.id, url=og_result["image_url"])
        else:
            logger.warning("OG image generation returned no URL", result=og_result)
    except Exception as e:
        logger.warning("Failed to generate OG image", error=str(e), page_id=page.id)

    result = {
        "page": page.model_dump(mode="json"),
        "form": None,
        "workflow": None,
    }

    # Create form if requested
    if request.include_form:
        form_repo = FormRepository()

        # Use synthesized form config if provided, otherwise use defaults
        if request.synthesized_form_config:
            synth_form = request.synthesized_form_config
            # Convert synthesized field dicts to FormField objects
            form_fields = []
            for field_dict in synth_form.fields:
                field_type_str = field_dict.get("type", "text").upper()
                try:
                    field_type = FormFieldType[field_type_str]
                except KeyError:
                    field_type = FormFieldType.TEXT
                form_fields.append(
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name=field_dict.get("name", "field"),
                        label=field_dict.get("label", "Field"),
                        type=field_type,
                        required=field_dict.get("required", False),
                        placeholder=field_dict.get("placeholder", ""),
                        map_to_contact_field=field_dict.get("map_to_contact_field"),
                    )
                )
            form = Form(
                workspace_id=workspace_id,
                page_id=page.id,
                name=synth_form.name or f"Contact - {business_name}",
                description=f"Lead capture form for {business_name}",
                fields=form_fields,
                submit_button_text=synth_form.submit_button_text,
                success_message=synth_form.success_message,
                add_tags=synth_form.add_tags,
                trigger_workflow=True,
            )
            logger.info("Using synthesized form config", field_count=len(form_fields))
        else:
            # Legacy hardcoded form
            cta_text = content.get("cta_text", "Get Started")
            form = Form(
                workspace_id=workspace_id,
                page_id=page.id,
                name=f"Contact - {request.name}",
                description=f"Lead capture form for {request.name}",
                fields=[
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="email",
                        label="Email",
                        type=FormFieldType.EMAIL,
                        required=True,
                        placeholder="your@email.com",
                        map_to_contact_field="email",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="first_name",
                        label="Name",
                        type=FormFieldType.TEXT,
                        required=True,
                        placeholder="Your name",
                        map_to_contact_field="first_name",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="phone",
                        label="Phone",
                        type=FormFieldType.PHONE,
                        required=False,
                        placeholder="(555) 123-4567",
                        map_to_contact_field="phone",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="message",
                        label="Message",
                        type=FormFieldType.TEXTAREA,
                        required=False,
                        placeholder="How can we help?",
                    ),
                ],
                submit_button_text=cta_text,
                success_message="Thanks! We'll be in touch shortly.",
                add_tags=request.automation.add_tags or ["lead", "website"],
                trigger_workflow=True,
            )

        form = form_repo.create_form(form)
        result["form"] = form.model_dump(mode="json")
        logger.info("Form created for complete package", form_id=form.id, page_id=page.id)

        # Update page with form reference AND update form block with actual form ID
        page.form_ids = [form.id]
        for block in page.blocks:
            if block.type == "form" and not block.config.get("formId"):
                block.config["formId"] = form.id
                break
        repo.update_page(page)

        # Update result with the updated page data
        result["page"] = page.model_dump(mode="json")

        # Create automation workflow
        # Use synthesized_workflow_config if provided, otherwise fall back to request.automation
        synth_wf = request.synthesized_workflow_config
        should_create_workflow = (
            (synth_wf and (synth_wf.send_welcome_email or synth_wf.notify_owner))
            or (not synth_wf and (request.automation.send_welcome_email or request.automation.notify_owner))
        )

        if should_create_workflow:
            workflow_repo = WorkflowRepository()

            if synth_wf:
                # Use synthesis-generated workflow config
                automation_config = AutomationConfig(
                    send_welcome_email=synth_wf.send_welcome_email,
                    notify_owner=synth_wf.notify_owner,
                    owner_email=synth_wf.owner_email,
                    welcome_message=synth_wf.welcome_message,
                    add_tags=synth_wf.add_tags or ["lead", "website"],
                )
                workflow_name = synth_wf.name
                wf_trigger_type = synth_wf.trigger_type
                logger.info("Using synthesized workflow config", workflow_name=workflow_name, trigger_type=wf_trigger_type)
            else:
                # Legacy automation config
                automation_config = request.automation
                workflow_name = f"{business_name} Lead Automation"
                wf_trigger_type = "trigger_form_submitted"

            workflow = _build_automation_workflow(
                workspace_id=workspace_id,
                page_id=page.id,
                form_id=form.id,
                business_name=business_name,
                automation=automation_config,
                trigger_type=wf_trigger_type,
            )
            workflow.name = workflow_name
            workflow = workflow_repo.create_workflow(workflow)
            result["workflow"] = workflow.model_dump(mode="json", by_alias=True)
            logger.info("Workflow created for complete package", workflow_id=workflow.id, page_id=page.id)

    logger.info(
        "Complete package created",
        page_id=page.id,
        has_form=result["form"] is not None,
        has_workflow=result["workflow"] is not None,
    )

    return created(result)


def _update_complete_page(
    repo: PageRepository,
    workspace_id: str,
    request: CreateCompleteRequest,
) -> dict:
    """Update an existing page with AI-generated content.

    This is the "update mode" of the AI wizard. Instead of creating a new page,
    it updates the existing page's blocks and content while preserving:
    - Page ID, slug, name (unless new name provided)
    - Subdomain and custom domain settings
    - Existing forms (adds new one if include_form and no forms exist)
    - Existing workflows (adds new one if automation enabled and no workflows exist)
    """
    # Get existing page
    page = repo.get_by_id(workspace_id, request.page_id)
    if not page:
        return not_found("Page", request.page_id)

    logger.info("Updating existing page with AI content", page_id=page.id, page_name=page.name)

    # Extract content from wizard
    content = request.content.get("content", request.content)
    business_info = request.content.get("business_info", {})
    colors = request.colors

    # Build page blocks from generated content
    blocks = _build_blocks_from_content(content, business_info, request.style, colors)

    # Update page fields
    headline = ""
    if content.get("headlines") and len(content["headlines"]) > 0:
        headline = content["headlines"][0]

    page.headline = headline
    page.subheadline = content.get("hero_subheadline", content.get("tagline", ""))
    page.blocks = blocks
    page.primary_color = colors.get("primary", "#6366f1")
    page.chat_config = ChatConfig(
        enabled=request.include_chat,
        position="bottom-right",
        initial_message=f"Hi! How can I help you learn more about {business_info.get('business_name', page.name)}?",
        ai_persona=f"Helpful assistant for {business_info.get('business_name', page.name)}",
    )
    page.meta_title = page.name
    page.meta_description = content.get("hero_subheadline", content.get("tagline", ""))

    # Update name if provided
    if request.name:
        page.name = request.name

    # Update subdomain if provided (and different from current)
    if request.subdomain is not None:
        subdomain = request.subdomain.lower() if request.subdomain else None
        if subdomain and subdomain != (page.subdomain or "").lower():
            if subdomain in RESERVED_SUBDOMAINS:
                return error(f"Subdomain '{subdomain}' is reserved", 400, error_code="SUBDOMAIN_RESERVED")
            if repo.subdomain_exists(subdomain, exclude_page_id=page.id):
                return error(f"Subdomain '{subdomain}' is already taken", 400, error_code="SUBDOMAIN_EXISTS")
        page.subdomain = subdomain

    # Save page updates
    page = repo.update_page(page)
    logger.info("Page updated with AI content", page_id=page.id)

    result = {
        "page": page.model_dump(mode="json"),
        "form": None,
        "workflow": None,
        "updated": True,  # Flag to indicate this was an update, not create
    }

    # Check for existing forms
    form_repo = FormRepository()
    existing_forms, _ = form_repo.list_by_page(page.id)

    # Create form if requested AND no forms exist
    if request.include_form and not existing_forms:
        synth_form = request.synthesized_form_config

        if synth_form and synth_form.fields:
            # Use synthesis-generated form config
            form_fields = []
            for field_def in synth_form.fields:
                field_type = FormFieldType(field_def.get("type", "text"))
                form_fields.append(
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name=field_def.get("name", "field"),
                        label=field_def.get("label", "Field"),
                        type=field_type,
                        required=field_def.get("required", False),
                        placeholder=field_def.get("placeholder", ""),
                        map_to_contact_field=field_def.get("map_to_contact_field"),
                    )
                )
            form = Form(
                workspace_id=workspace_id,
                page_id=page.id,
                name=synth_form.name or f"Contact - {page.name}",
                description=f"Lead capture form for {page.name}",
                fields=form_fields,
                submit_button_text=synth_form.submit_button_text,
                success_message=synth_form.success_message,
                add_tags=synth_form.add_tags,
                trigger_workflow=True,
            )
            logger.info("Using synthesized form config for update", field_count=len(form_fields))
        else:
            # Legacy hardcoded form
            cta_text = content.get("cta_text", "Get Started")
            form = Form(
                workspace_id=workspace_id,
                page_id=page.id,
                name=f"Contact - {page.name}",
                description=f"Lead capture form for {page.name}",
                fields=[
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="email",
                        label="Email",
                        type=FormFieldType.EMAIL,
                        required=True,
                        placeholder="your@email.com",
                        map_to_contact_field="email",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="first_name",
                        label="Name",
                        type=FormFieldType.TEXT,
                        required=True,
                        placeholder="Your name",
                        map_to_contact_field="first_name",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="phone",
                        label="Phone",
                        type=FormFieldType.PHONE,
                        required=False,
                        placeholder="(555) 123-4567",
                        map_to_contact_field="phone",
                    ),
                    FormField(
                        id=str(uuid.uuid4())[:8],
                        name="message",
                        label="Message",
                        type=FormFieldType.TEXTAREA,
                        required=False,
                        placeholder="How can we help?",
                    ),
                ],
                submit_button_text=cta_text,
                success_message="Thanks! We'll be in touch shortly.",
                add_tags=request.automation.add_tags or ["lead", "website"],
                trigger_workflow=True,
            )

        form = form_repo.create_form(form)
        result["form"] = form.model_dump(mode="json")
        logger.info("Form created for updated page", form_id=form.id, page_id=page.id)

        # Update page with form reference AND update form block with actual form ID
        page.form_ids = [form.id]
        for block in page.blocks:
            if block.type == "form" and not block.config.get("formId"):
                block.config["formId"] = form.id
                break
        repo.update_page(page)
        result["page"] = page.model_dump(mode="json")
    elif existing_forms:
        # Use first existing form for the form block
        existing_form = existing_forms[0]
        result["form"] = existing_form.model_dump(mode="json")
        # Ensure page.form_ids is set for existing forms
        if existing_form.id not in (page.form_ids or []):
            page.form_ids = list(page.form_ids or []) + [existing_form.id]
        for block in page.blocks:
            if block.type == "form" and not block.config.get("formId"):
                block.config["formId"] = existing_form.id
                break
        repo.update_page(page)
        result["page"] = page.model_dump(mode="json")

    # Check for existing workflows
    workflow_repo = WorkflowRepository()
    existing_workflows, _ = workflow_repo.list_by_page(page.id)

    # Create automation workflow if requested AND no workflows exist
    # Use synthesized_workflow_config if provided, otherwise fall back to request.automation
    synth_wf = request.synthesized_workflow_config
    should_create_workflow = (
        (synth_wf and (synth_wf.send_welcome_email or synth_wf.notify_owner))
        or (not synth_wf and (request.automation.send_welcome_email or request.automation.notify_owner))
    ) and not existing_workflows

    if should_create_workflow:
        form_id = result["form"]["id"] if result["form"] else (existing_forms[0].id if existing_forms else None)
        if form_id:
            if synth_wf:
                # Use synthesis-generated workflow config
                automation_config = AutomationConfig(
                    send_welcome_email=synth_wf.send_welcome_email,
                    notify_owner=synth_wf.notify_owner,
                    owner_email=synth_wf.owner_email,
                    welcome_message=synth_wf.welcome_message,
                    add_tags=synth_wf.add_tags or ["lead", "website"],
                )
                workflow_name = synth_wf.name
                wf_trigger_type = synth_wf.trigger_type
                logger.info("Using synthesized workflow config for update", workflow_name=workflow_name, trigger_type=wf_trigger_type)
            else:
                # Legacy automation config
                automation_config = request.automation
                workflow_name = f"{page.name} Lead Automation"
                wf_trigger_type = "trigger_form_submitted"

            workflow = _build_automation_workflow(
                workspace_id=workspace_id,
                page_id=page.id,
                form_id=form_id,
                business_name=business_info.get("business_name", page.name),
                automation=automation_config,
                trigger_type=wf_trigger_type,
            )
            workflow.name = workflow_name
            workflow = workflow_repo.create_workflow(workflow)
            result["workflow"] = workflow.model_dump(mode="json", by_alias=True)
            logger.info("Workflow created for updated page", workflow_id=workflow.id, page_id=page.id)
    elif existing_workflows:
        result["workflow"] = existing_workflows[0].model_dump(mode="json", by_alias=True)

    # Invalidate CDN cache if page has subdomain or custom domain
    if page.subdomain or page.custom_domain:
        try:
            invalidation_result = invalidate_page_cache(
                subdomain=page.subdomain,
                custom_domain=page.custom_domain,
                page_id=page.id,
            )
            logger.info(
                "CDN cache invalidated for updated page",
                page_id=page.id,
                subdomain=page.subdomain,
                result=invalidation_result,
            )
        except Exception as e:
            logger.warning("Failed to invalidate CDN cache", page_id=page.id, error=str(e))

    logger.info(
        "Page update complete",
        page_id=page.id,
        has_form=result["form"] is not None,
        has_workflow=result["workflow"] is not None,
    )

    return success(result)


def _build_blocks_from_content(
    content: dict,
    business_info: dict,
    style: str,
    colors: dict,
) -> list[PageBlock]:
    """Build page blocks from AI-generated content."""
    blocks = []
    order = 0

    # Style-based settings
    style_gradients = {
        "professional": ["#1e1b4b", "#312e81"],
        "bold": ["#0f0f0f", "#1f1f1f"],
        "minimal": ["#fafafa", "#f5f5f5"],
        "playful": ["#831843", "#701a75"],
    }
    gradients = style_gradients.get(style, style_gradients["professional"])

    # Hero block
    headline = ""
    if content.get("headlines") and len(content["headlines"]) > 0:
        headline = content["headlines"][0]

    hero_image_url = content.get("hero_image_url")
    hero_config = {
        "headline": headline,
        "subheadline": content.get("hero_subheadline", content.get("tagline", "")),
        "buttonText": content.get("cta_text", "Get Started"),
        "buttonLink": "#contact",
        "backgroundType": "image" if hero_image_url else "gradient",
        "gradientFrom": gradients[0],
        "gradientTo": gradients[1],
        "textAlign": "center",
        "showButton": True,
    }
    if hero_image_url:
        hero_config["backgroundImage"] = hero_image_url

    blocks.append(PageBlock(
        id=str(uuid.uuid4())[:8],
        type="hero",
        order=order,
        width=4,
        config=hero_config,
    ))
    order += 1

    # Features block
    features = content.get("features", [])
    if features:
        blocks.append(PageBlock(
            id=str(uuid.uuid4())[:8],
            type="features",
            order=order,
            width=4,
            config={
                "title": "Why Choose Us",
                "subtitle": content.get("value_props", [""])[0] if content.get("value_props") else "",
                "columns": min(len(features), 3),
                "items": [
                    {
                        "icon": f.get("icon", "⚡"),
                        "title": f.get("title", "Feature"),
                        "description": f.get("description", ""),
                    }
                    for f in features[:3]
                ],
            },
        ))
        order += 1

    # Stats block (if we have social proof)
    if content.get("social_proof"):
        blocks.append(PageBlock(
            id=str(uuid.uuid4())[:8],
            type="stats",
            order=order,
            width=4,
            config={
                "title": "",
                "items": [
                    {"value": "100%", "label": "Satisfaction"},
                    {"value": "24/7", "label": "Support"},
                    {"value": "5+", "label": "Years Experience"},
                ],
            },
        ))
        order += 1

    # Testimonials block (if we have concepts)
    testimonials = content.get("testimonial_concepts", [])
    testimonial_avatars = content.get("testimonial_avatars", [])
    placeholder_names = ["Sarah M.", "James T.", "Emily R.", "Michael K.", "Jessica L."]
    placeholder_companies = ["Satisfied Customer", "Happy Client", "Loyal Customer", "Verified Buyer", "Business Owner"]

    if testimonials:
        blocks.append(PageBlock(
            id=str(uuid.uuid4())[:8],
            type="testimonials",
            order=order,
            width=4,
            config={
                "title": "What People Say",
                "items": [
                    {
                        "quote": t,
                        "author": placeholder_names[i] if i < len(placeholder_names) else "Happy Customer",
                        "company": placeholder_companies[i] if i < len(placeholder_companies) else "",
                        "avatar": testimonial_avatars[i] if i < len(testimonial_avatars) else "",
                    }
                    for i, t in enumerate(testimonials[:3])
                ],
            },
        ))
        order += 1

    # FAQ block
    faqs = content.get("faq", [])
    if faqs:
        blocks.append(PageBlock(
            id=str(uuid.uuid4())[:8],
            type="faq",
            order=order,
            width=4,
            config={
                "title": "Frequently Asked Questions",
                "items": [
                    {"question": f.get("q", ""), "answer": f.get("a", "")}
                    for f in faqs[:4]
                ],
            },
        ))
        order += 1

    # Form block placeholder (actual form is created separately)
    blocks.append(PageBlock(
        id=str(uuid.uuid4())[:8],
        type="form",
        order=order,
        width=4,
        config={
            "formId": "",  # Will be updated after form creation
            "title": "Get in Touch",
            "description": "Fill out the form and we'll be in touch shortly.",
        },
    ))
    order += 1

    # CTA block
    blocks.append(PageBlock(
        id=str(uuid.uuid4())[:8],
        type="cta",
        order=order,
        width=4,
        config={
            "headline": "Ready to Get Started?",
            "description": f"Take the next step with {business_info.get('business_name', 'us')}.",
            "buttonText": content.get("cta_text", "Get Started"),
            "buttonLink": "#contact",
            "backgroundColor": colors.get("primary", "#6366f1"),
            "textColor": "light" if style != "minimal" else "dark",
        },
    ))

    return blocks


_TRIGGER_LABELS = {
    "trigger_form_submitted": "Form Submitted",
    "trigger_chat_message": "Chat Message",
    "trigger_page_visit": "Page Visit",
}


def _build_automation_workflow(
    workspace_id: str,
    page_id: str,
    form_id: str,
    business_name: str,
    automation: AutomationConfig,
    trigger_type: str = "trigger_form_submitted",
) -> Workflow:
    """Build an automation workflow for the specified trigger type."""
    nodes = []
    edges = []
    node_y = 100

    # Build trigger config based on type
    if trigger_type == "trigger_form_submitted":
        trigger_config = {"form_id": form_id}
    elif trigger_type == "trigger_chat_message":
        trigger_config = {"page_id": page_id}
    elif trigger_type == "trigger_page_visit":
        trigger_config = {"page_id": page_id}
    else:
        trigger_config = {"form_id": form_id}
        trigger_type = "trigger_form_submitted"

    trigger_label = _TRIGGER_LABELS.get(trigger_type, "Form Submitted")

    # Trigger node
    trigger_id = str(uuid.uuid4())[:8]
    nodes.append(WorkflowNode(
        id=trigger_id,
        node_type=trigger_type,
        position={"x": 250, "y": node_y},
        data={
            "label": trigger_label,
            "config": trigger_config,
        },
    ))
    last_node_id = trigger_id
    node_y += 150

    # Update contact with tags
    if automation.add_tags:
        tag_id = str(uuid.uuid4())[:8]
        nodes.append(WorkflowNode(
            id=tag_id,
            node_type="action_update_contact",
            position={"x": 250, "y": node_y},
            data={
                "label": "Add Tags",
                "config": {
                    "add_tags": automation.add_tags,
                },
            },
        ))
        edges.append(WorkflowEdge(
            id=f"e{last_node_id}-{tag_id}",
            source=last_node_id,
            target=tag_id,
        ))
        last_node_id = tag_id
        node_y += 150

    # Welcome email to lead
    if automation.send_welcome_email:
        email_id = str(uuid.uuid4())[:8]
        welcome_msg = automation.welcome_message or (
            f"Thanks for reaching out to {business_name}! "
            "We've received your message and will get back to you shortly."
        )
        nodes.append(WorkflowNode(
            id=email_id,
            node_type="action_send_email",
            position={"x": 100, "y": node_y},
            data={
                "label": "Welcome Email",
                "config": {
                    "email_to": "{{contact.email}}",
                    "email_subject": f"Thanks for contacting {business_name}!",
                    "email_body": f"Hi {{{{contact.first_name}}}},\n\n{welcome_msg}\n\nBest regards,\n{business_name}",
                    "email_from": "noreply@complens.ai",
                },
            },
        ))
        edges.append(WorkflowEdge(
            id=f"e{last_node_id}-{email_id}",
            source=last_node_id,
            target=email_id,
        ))

    # Notify owner
    if automation.notify_owner and automation.owner_email:
        notify_id = str(uuid.uuid4())[:8]
        nodes.append(WorkflowNode(
            id=notify_id,
            node_type="action_send_email",
            position={"x": 400, "y": node_y},
            data={
                "label": "Notify Owner",
                "config": {
                    "email_to": automation.owner_email,
                    "email_subject": f"New Lead: {{{{contact.first_name}}}} {{{{contact.last_name}}}}",
                    "email_body": (
                        f"New lead from {business_name} website!\n\n"
                        "Contact Details:\n"
                        "- Name: {{contact.first_name}} {{contact.last_name}}\n"
                        "- Email: {{contact.email}}\n"
                        "- Phone: {{contact.phone}}\n\n"
                        "Form Data:\n{{trigger_data.form_data}}"
                    ),
                    "email_from": "noreply@complens.ai",
                },
            },
        ))
        edges.append(WorkflowEdge(
            id=f"e{last_node_id}-{notify_id}",
            source=last_node_id,
            target=notify_id,
        ))

    workflow = Workflow(
        workspace_id=workspace_id,
        page_id=page_id,
        name=f"Lead Automation - {business_name}",
        description=f"Automatically processes new leads from the {business_name} landing page",
        nodes=nodes,
        edges=edges,
        status=WorkflowStatus.ACTIVE,
    )

    return workflow


def generate_page_content(event: dict) -> dict:
    """Generate page content using templates + AI copy.

    AI generates the text content, we merge it into a beautiful template.
    Much more reliable than AI-generated HTML.
    """
    from complens.services.page_templates import fill_template, get_template, list_templates

    path_params = event.get("pathParameters", {}) or {}
    workspace_id = path_params.get("workspace_id")

    if not workspace_id:
        return error("Workspace ID is required", 400)

    try:
        body = json.loads(event.get("body", "{}"))
        request = GeneratePageRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Verify template exists
    template = get_template(request.template)
    if not template:
        return error(f"Invalid template: {request.template}. Available: professional, bold, minimal", 400)

    # Build prompt for AI to generate just the copy - SIMPLIFIED for 3-section templates
    audience_note = f"\nTarget audience: {request.target_audience}" if request.target_audience else ""
    cta_note = f"\nPrimary CTA: {request.call_to_action}" if request.call_to_action else ""

    system_prompt = """Generate punchy landing page copy. Return ONLY valid JSON:
{
  "name": "Business Name",
  "slug": "url-slug",
  "tagline": "2-4 words MAX",
  "headline": "PUNCHY headline 3-6 words",
  "subheadline": "Value prop 15-20 words",
  "cta_text": "Action verb 2-3 words",
  "feature_1_icon": "🚀",
  "feature_1_title": "Benefit 2-3 words",
  "feature_1_description": "What they get. 15-20 words.",
  "feature_2_icon": "⚡",
  "feature_2_title": "Benefit 2-3 words",
  "feature_2_description": "What they get. 15-20 words.",
  "feature_3_icon": "✨",
  "feature_3_title": "Benefit 2-3 words",
  "feature_3_description": "What they get. 15-20 words.",
  "cta_headline": "Final push 3-5 words",
  "cta_subheadline": "Last chance to convince 10-15 words",
  "primary_color": "#6366f1",
  "meta_title": "SEO title 60 chars",
  "meta_description": "SEO desc 150 chars",
  "chat_greeting": "Welcome message",
  "chat_persona": "Who the AI should act as"
}

RULES:
- Headlines must be SHORT and PUNCHY. No filler words.
- Features focus on BENEFITS not features.
- Use power words: Transform, Unlock, Accelerate, Master, Dominate
- Icons: 🚀 ⚡ ✨ 💎 🎯 📈 💡 🔒 ⭐ 🛠️ 💰 🔥 ✅ 🏆 💪
- Colors by industry: tech=#6366f1 health=#10b981 finance=#0ea5e9 creative=#f59e0b
- Return ONLY JSON, no markdown."""

    user_prompt = f"""Write landing page copy for this:{audience_note}{cta_note}

{request.source_content[:3000]}

Return only JSON."""

    try:
        bedrock = boto3.client("bedrock-runtime")

        response = bedrock.invoke_model(
            modelId="us.anthropic.claude-haiku-4-5-20251001-v1:0",
            contentType="application/json",
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2000,
                "temperature": 0.7,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            }),
        )

        response_body = json.loads(response["body"].read())
        ai_text = ""

        for block in response_body.get("content", []):
            if block.get("type") == "text":
                ai_text = block.get("text", "")
                break

        # Strip markdown code blocks
        ai_text = re.sub(r'^```(?:json)?\s*', '', ai_text.strip())
        ai_text = re.sub(r'\s*```$', '', ai_text)

        # Parse JSON
        json_match = re.search(r'\{[\s\S]*\}', ai_text)
        if not json_match:
            logger.error("AI response did not contain valid JSON", response=ai_text[:500])
            return error("Failed to generate content", 500)

        content = json.loads(json_match.group())

        # Fill the template with AI-generated content
        body_content = fill_template(request.template, content)

        # Build result
        result = {
            "name": str(content.get("name", "New Page"))[:255],
            "slug": re.sub(r'[^a-z0-9-]', '-', str(content.get("slug", "new-page")).lower())[:100],
            "headline": str(content.get("headline", ""))[:500],
            "subheadline": str(content.get("subheadline", ""))[:1000],
            "body_content": body_content,
            "primary_color": content.get("primary_color", "#6366f1"),
            "meta_title": str(content.get("meta_title", ""))[:100],
            "meta_description": str(content.get("meta_description", ""))[:300],
            "chat_config": {
                "enabled": True,
                "position": "bottom-right",
                "initial_message": content.get("chat_greeting", "Hi! How can I help?"),
                "ai_persona": content.get("chat_persona", "Helpful assistant"),
            },
            "template": request.template,
        }

        # Validate primary color
        if not re.match(r'^#[0-9A-Fa-f]{6}$', result["primary_color"]):
            result["primary_color"] = "#6366f1"

        # If form creation was requested, include a form template in the result
        # The actual form will be created when the page is saved (forms now require page_id)
        if request.create_form:
            result["create_form_on_save"] = True
            result["form_template"] = {
                "name": f"Contact - {result['name']}",
                "description": f"Contact form for {result['name']}",
                "fields": [
                    {"id": str(uuid.uuid4())[:8], "name": "email", "label": "Email", "type": "email", "required": True, "map_to_contact_field": "email"},
                    {"id": str(uuid.uuid4())[:8], "name": "first_name", "label": "Name", "type": "text", "required": True, "map_to_contact_field": "first_name"},
                    {"id": str(uuid.uuid4())[:8], "name": "message", "label": "Message", "type": "textarea", "required": False},
                ],
                "submit_button_text": content.get("cta_text", "Get Started"),
                "success_message": "Thanks! We'll be in touch soon.",
            }

        logger.info("Page generated with template", name=result["name"], template=request.template)
        return success({"generated": result, "templates": list_templates()})

    except json.JSONDecodeError as e:
        logger.error("JSON parse failed", error=str(e), response=ai_text[:500] if ai_text else "empty")
        return error("Failed to parse AI response", 500)
    except Exception as e:
        logger.exception("Generation failed", error=str(e))
        return error("Failed to generate page content", 500)


# =============================================================================
# Nested Forms Handlers (Forms belong to Pages)
# =============================================================================

def handle_page_forms(
    event: dict,
    http_method: str,
    workspace_id: str,
    page_id: str,
    form_id: str | None,
) -> dict:
    """Handle nested form endpoints under pages."""
    form_repo = FormRepository()
    page_repo = PageRepository()

    # Verify page exists
    page = page_repo.get_by_id(workspace_id, page_id)
    if not page:
        return not_found("Page", page_id)

    if http_method == "GET" and form_id:
        return get_page_form(form_repo, workspace_id, page_id, form_id)
    elif http_method == "GET":
        return list_page_forms(form_repo, workspace_id, page, event)
    elif http_method == "POST":
        return create_page_form(form_repo, workspace_id, page_id, event)
    elif http_method == "PUT" and form_id:
        return update_page_form(form_repo, workspace_id, page_id, form_id, event)
    elif http_method == "DELETE" and form_id:
        return delete_page_form(form_repo, workspace_id, page_id, form_id)
    else:
        return error("Method not allowed", 405)


def list_page_forms(
    repo: FormRepository,
    workspace_id: str,
    page: Page,
    event: dict,
) -> dict:
    """List forms for a specific page.

    Supports both new forms (with page_id set) and legacy forms (in page.form_ids).
    """
    query_params = event.get("queryStringParameters", {}) or {}
    limit = min(int(query_params.get("limit", 50)), 100)

    # New way: forms with page_id set
    forms, next_key = repo.list_by_page(page.id, limit=limit)
    form_list = [f.model_dump(mode="json") for f in forms]

    # Legacy way: forms referenced by form_ids (for backwards compatibility)
    form_ids_set = set(f.get("id") for f in form_list)  # Avoid duplicates
    if page.form_ids:
        for form_id in page.form_ids:
            if form_id not in form_ids_set:
                form = repo.get_by_id(workspace_id, form_id)
                if form:
                    form_list.append(form.model_dump(mode="json"))

    return success({
        "items": form_list,
        "pagination": {"limit": limit},
    })


def get_page_form(
    repo: FormRepository,
    workspace_id: str,
    page_id: str,
    form_id: str,
) -> dict:
    """Get a single form by ID, verifying it belongs to the page."""
    form = repo.get_by_id(workspace_id, form_id)
    if not form:
        return not_found("Form", form_id)
    if form.page_id != page_id:
        return error("Form does not belong to this page", 404)

    return success(form.model_dump(mode="json"))


def create_page_form(
    repo: FormRepository,
    workspace_id: str,
    page_id: str,
    event: dict,
) -> dict:
    """Create a new form for a page."""
    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Create form request", workspace_id=workspace_id, page_id=page_id, body=body)
        request = CreateFormRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Form request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON body", error=str(e))
        return error("Invalid JSON body", 400)

    # Create form with page_id
    form = Form(
        workspace_id=workspace_id,
        page_id=page_id,
        name=request.name,
        description=request.description,
        fields=request.fields,
        submit_button_text=request.submit_button_text,
        success_message=request.success_message,
        redirect_url=request.redirect_url,
        create_contact=request.create_contact,
        add_tags=request.add_tags,
        trigger_workflow=request.trigger_workflow,
        honeypot_enabled=request.honeypot_enabled,
    )

    form = repo.create_form(form)

    logger.info("Form created", form_id=form.id, workspace_id=workspace_id, page_id=page_id)

    return created(form.model_dump(mode="json"))


def update_page_form(
    repo: FormRepository,
    workspace_id: str,
    page_id: str,
    form_id: str,
    event: dict,
) -> dict:
    """Update an existing form, verifying it belongs to the page."""
    form = repo.get_by_id(workspace_id, form_id)
    if not form:
        return not_found("Form", form_id)
    if form.page_id != page_id:
        return error("Form does not belong to this page", 404)

    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Update form request", form_id=form_id, body=body)
        request = UpdateFormRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Update request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Apply updates
    if request.name is not None:
        form.name = request.name
    if request.description is not None:
        form.description = request.description
    if request.fields is not None:
        form.fields = request.fields
    if request.submit_button_text is not None:
        form.submit_button_text = request.submit_button_text
    if request.success_message is not None:
        form.success_message = request.success_message
    if request.redirect_url is not None:
        form.redirect_url = request.redirect_url
    if request.create_contact is not None:
        form.create_contact = request.create_contact
    if request.add_tags is not None:
        form.add_tags = request.add_tags
    if request.trigger_workflow is not None:
        form.trigger_workflow = request.trigger_workflow
    if request.honeypot_enabled is not None:
        form.honeypot_enabled = request.honeypot_enabled
    if request.recaptcha_enabled is not None:
        form.recaptcha_enabled = request.recaptcha_enabled

    form = repo.update_form(form)

    logger.info("Form updated", form_id=form_id, workspace_id=workspace_id, page_id=page_id)

    return success(form.model_dump(mode="json"))


def delete_page_form(
    repo: FormRepository,
    workspace_id: str,
    page_id: str,
    form_id: str,
) -> dict:
    """Delete a form, verifying it belongs to the page."""
    form = repo.get_by_id(workspace_id, form_id)
    if not form:
        return not_found("Form", form_id)
    if form.page_id != page_id:
        return error("Form does not belong to this page", 404)

    deleted = repo.delete_form(workspace_id, form_id)

    if not deleted:
        return not_found("Form", form_id)

    logger.info("Form deleted", form_id=form_id, workspace_id=workspace_id, page_id=page_id)

    return success({"deleted": True, "id": form_id})


# =============================================================================
# Nested Workflows Handlers (Page-specific workflows)
# =============================================================================

def handle_page_workflows(
    event: dict,
    http_method: str,
    workspace_id: str,
    page_id: str,
    workflow_id: str | None,
) -> dict:
    """Handle nested workflow endpoints under pages."""
    workflow_repo = WorkflowRepository()
    page_repo = PageRepository()

    # Verify page exists
    page = page_repo.get_by_id(workspace_id, page_id)
    if not page:
        return not_found("Page", page_id)

    if http_method == "GET" and workflow_id:
        return get_page_workflow(workflow_repo, workspace_id, page_id, workflow_id)
    elif http_method == "GET":
        return list_page_workflows(workflow_repo, page_id, event)
    elif http_method == "POST":
        return create_page_workflow(workflow_repo, workspace_id, page_id, event)
    elif http_method == "PUT" and workflow_id:
        return update_page_workflow(workflow_repo, workspace_id, page_id, workflow_id, event)
    elif http_method == "DELETE" and workflow_id:
        return delete_page_workflow(workflow_repo, workspace_id, page_id, workflow_id)
    else:
        return error("Method not allowed", 405)


def list_page_workflows(
    repo: WorkflowRepository,
    page_id: str,
    event: dict,
) -> dict:
    """List workflows for a specific page."""
    query_params = event.get("queryStringParameters", {}) or {}
    limit = min(int(query_params.get("limit", 50)), 100)
    status_filter = query_params.get("status")

    status = None
    if status_filter:
        try:
            status = WorkflowStatus(status_filter)
        except ValueError:
            return error(f"Invalid status: {status_filter}", 400)

    workflows, next_key = repo.list_by_page(page_id, status=status, limit=limit)

    return success({
        "items": [w.model_dump(mode="json", by_alias=True) for w in workflows],
        "pagination": {"limit": limit},
    })


def get_page_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    page_id: str,
    workflow_id: str,
) -> dict:
    """Get a single workflow by ID, verifying it belongs to the page."""
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)
    if workflow.page_id != page_id:
        return error("Workflow does not belong to this page", 404)

    return success(workflow.model_dump(mode="json", by_alias=True))


def create_page_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    page_id: str,
    event: dict,
) -> dict:
    """Create a new workflow for a page."""
    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Create page workflow request", workspace_id=workspace_id, page_id=page_id, body=body)
        request = CreateWorkflowRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Workflow request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON body", error=str(e))
        return error("Invalid JSON body", 400)

    # Parse nodes with validation
    nodes = []
    for i, n in enumerate(request.nodes):
        try:
            node = WorkflowNode.model_validate(n)
            nodes.append(node)
        except PydanticValidationError as e:
            logger.warning("Node validation failed", index=i, node=n, errors=e.errors())
            return validation_error([
                {"field": f"nodes[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                for err in e.errors()
            ])

    # Parse edges with validation
    edges = []
    for i, e_data in enumerate(request.edges):
        try:
            edge = WorkflowEdge.model_validate(e_data)
            edges.append(edge)
        except PydanticValidationError as e:
            logger.warning("Edge validation failed", index=i, edge=e_data, errors=e.errors())
            return validation_error([
                {"field": f"edges[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                for err in e.errors()
            ])

    # Build settings
    default_settings = {
        "max_concurrent_runs": 100,
        "timeout_minutes": 60,
        "retry_on_failure": True,
        "max_retries": 3,
    }
    settings = {**default_settings, **request.settings} if request.settings else default_settings

    # Create workflow with page_id
    workflow = Workflow(
        workspace_id=workspace_id,
        page_id=page_id,
        name=request.name,
        description=request.description,
        nodes=nodes,
        edges=edges,
        viewport=request.viewport,
        settings=settings,
    )

    # Validate workflow graph
    validation_errors = workflow.validate_graph()
    if validation_errors:
        logger.warning("Workflow graph validation failed", errors=validation_errors)
        return validation_error([{"field": "graph", "message": err} for err in validation_errors])

    workflow = repo.create_workflow(workflow)

    logger.info("Page workflow created", workflow_id=workflow.id, workspace_id=workspace_id, page_id=page_id)

    return created(workflow.model_dump(mode="json", by_alias=True))


def update_page_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    page_id: str,
    workflow_id: str,
    event: dict,
) -> dict:
    """Update an existing workflow, verifying it belongs to the page."""
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)
    if workflow.page_id != page_id:
        return error("Workflow does not belong to this page", 404)

    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Update page workflow request", workflow_id=workflow_id, body=body)
        request = UpdateWorkflowRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Update request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Apply updates
    if request.name is not None:
        workflow.name = request.name
    if request.description is not None:
        workflow.description = request.description
    if request.status is not None:
        workflow.status = request.status

    # Parse nodes with validation
    if request.nodes is not None:
        nodes = []
        for i, n in enumerate(request.nodes):
            try:
                node = WorkflowNode.model_validate(n)
                nodes.append(node)
            except PydanticValidationError as e:
                logger.warning("Node validation failed in update", index=i, node=n, errors=e.errors())
                return validation_error([
                    {"field": f"nodes[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                    for err in e.errors()
                ])
        workflow.nodes = nodes

    # Parse edges with validation
    if request.edges is not None:
        edges = []
        for i, e_data in enumerate(request.edges):
            try:
                edge = WorkflowEdge.model_validate(e_data)
                edges.append(edge)
            except PydanticValidationError as e:
                logger.warning("Edge validation failed in update", index=i, edge=e_data, errors=e.errors())
                return validation_error([
                    {"field": f"edges[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                    for err in e.errors()
                ])
        workflow.edges = edges

    if request.viewport is not None:
        workflow.viewport = request.viewport
    if request.settings is not None:
        workflow.settings = {**workflow.settings, **request.settings}

    # Validate if nodes/edges were updated
    if request.nodes is not None or request.edges is not None:
        validation_errors = workflow.validate_graph()
        if validation_errors:
            logger.warning("Graph validation failed in update", errors=validation_errors)
            return validation_error([{"field": "graph", "message": err} for err in validation_errors])

    workflow = repo.update_workflow(workflow)

    logger.info("Page workflow updated", workflow_id=workflow_id, workspace_id=workspace_id, page_id=page_id)

    return success(workflow.model_dump(mode="json", by_alias=True))


def delete_page_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    page_id: str,
    workflow_id: str,
) -> dict:
    """Delete a workflow, verifying it belongs to the page."""
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)
    if workflow.page_id != page_id:
        return error("Workflow does not belong to this page", 404)

    deleted = repo.delete_workflow(workspace_id, workflow_id)

    if not deleted:
        return not_found("Workflow", workflow_id)

    logger.info("Page workflow deleted", workflow_id=workflow_id, workspace_id=workspace_id, page_id=page_id)

    return success({"deleted": True, "id": workflow_id})
