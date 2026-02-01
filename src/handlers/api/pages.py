"""Pages API handler (admin, authenticated)."""

import json
import re
from typing import Any

import boto3
import structlog
from pydantic import BaseModel as PydanticBaseModel, Field, ValidationError as PydanticValidationError

from complens.models.page import (
    ChatConfig,
    CreatePageRequest,
    Page,
    PageStatus,
    RESERVED_SUBDOMAINS,
    UpdatePageRequest,
)
from complens.repositories.page import PageRepository
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


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle pages API requests.

    Routes:
        GET    /workspaces/{workspace_id}/pages
        POST   /workspaces/{workspace_id}/pages
        POST   /workspaces/{workspace_id}/pages/generate  - AI generate page content
        GET    /workspaces/{workspace_id}/pages/check-subdomain?subdomain=xxx
        GET    /workspaces/{workspace_id}/pages/{page_id}
        PUT    /workspaces/{workspace_id}/pages/{page_id}
        DELETE /workspaces/{workspace_id}/pages/{page_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        page_id = path_params.get("page_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = PageRepository()

        # Route to appropriate handler
        # Check for /generate endpoint first (before page_id check)
        if http_method == "POST" and path.endswith("/pages/generate"):
            return generate_page_content(event)
        elif http_method == "GET" and path.endswith("/pages/check-subdomain"):
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

    # Create page
    page = Page(
        workspace_id=workspace_id,
        name=request.name,
        slug=request.slug,
        headline=request.headline,
        subheadline=request.subheadline,
        hero_image_url=request.hero_image_url,
        body_content=request.body_content,
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

    # Save
    page = repo.update_page(page)

    logger.info("Page updated", page_id=page_id, workspace_id=workspace_id)

    return success(page.model_dump(mode="json"))


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


def generate_page_content(event: dict) -> dict:
    """Generate page content using templates + AI copy.

    AI generates the text content, we merge it into a beautiful template.
    Much more reliable than AI-generated HTML.
    """
    import uuid
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

        # Create form if requested
        if request.create_form:
            try:
                from complens.models.form import Form, FormField, FormFieldType
                from complens.repositories.form import FormRepository

                form_repo = FormRepository()
                form = Form(
                    workspace_id=workspace_id,
                    name=f"Contact - {result['name']}",
                    description=f"Contact form for {result['name']}",
                    fields=[
                        FormField(id=str(uuid.uuid4())[:8], name="email", label="Email", type=FormFieldType.EMAIL, required=True, map_to_contact_field="email"),
                        FormField(id=str(uuid.uuid4())[:8], name="first_name", label="Name", type=FormFieldType.TEXT, required=True, map_to_contact_field="first_name"),
                        FormField(id=str(uuid.uuid4())[:8], name="message", label="Message", type=FormFieldType.TEXTAREA, required=False),
                    ],
                    submit_button_text=content.get("cta_text", "Get Started"),
                    success_message="Thanks! We'll be in touch soon.",
                    create_contact=True,
                    trigger_workflow=True,
                    honeypot_enabled=True,
                )
                form = form_repo.create_form(form)
                result["form_id"] = form.id
                result["form_ids"] = [form.id]
                result["form"] = {"id": form.id, "name": form.name}
                logger.info("Form created", form_id=form.id)
            except Exception as form_err:
                logger.warning("Form creation failed", error=str(form_err))

        logger.info("Page generated with template", name=result["name"], template=request.template)
        return success({"generated": result, "templates": list_templates()})

    except json.JSONDecodeError as e:
        logger.error("JSON parse failed", error=str(e), response=ai_text[:500] if ai_text else "empty")
        return error("Failed to parse AI response", 500)
    except Exception as e:
        logger.exception("Generation failed", error=str(e))
        return error("Failed to generate page content", 500)
