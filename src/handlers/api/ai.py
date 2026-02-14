"""AI API handler for contextual AI operations.

Provides endpoints for:
- Business profile management
- AI onboarding
- Block content improvement
- Image generation
- Workflow generation from natural language
- Page synthesis (unified synthesis engine)
"""

import base64
import json
import os
from typing import Any
from uuid import uuid4

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.business_profile import (
    BusinessProfile,
    CreateBusinessProfileRequest,
    UpdateBusinessProfileRequest,
    ONBOARDING_QUESTIONS,
)
from complens.models.synthesis import (
    SynthesizeGenerateRequest,
    SynthesizePageRequest,
    SynthesizePlanRequest,
)
from complens.repositories.business_profile import BusinessProfileRepository
from complens.services import ai_service
from complens.services.synthesis_engine import SynthesisEngine
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError
from complens.utils.rate_limiter import check_rate_limit
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()

# S3 for image storage
ASSETS_BUCKET = os.environ.get("ASSETS_BUCKET", "")
s3 = boto3.client("s3")

# AI rate limits: 20 requests/min, 120/hour per workspace
AI_RATE_LIMIT_PER_MIN = 20
AI_RATE_LIMIT_PER_HOUR = 120


class _AIRateLimitExceeded(Exception):
    """Raised when AI rate limit is exceeded."""


def _check_ai_rate_limit(
    auth: dict, workspace_id: str, action: str = "ai_generate"
) -> None:
    """Check rate limit for AI generation endpoints.

    Args:
        auth: Auth context.
        workspace_id: Workspace ID.
        action: Rate limit action key.

    Raises:
        _AIRateLimitExceeded: If rate limit exceeded.
    """
    user_id = auth.user_id
    result = check_rate_limit(
        identifier=f"{workspace_id}:{user_id}",
        action=action,
        requests_per_minute=AI_RATE_LIMIT_PER_MIN,
        requests_per_hour=AI_RATE_LIMIT_PER_HOUR,
    )
    if not result.allowed:
        raise _AIRateLimitExceeded()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle AI API requests.

    Routes:
        # Business Profile
        GET    /workspaces/{workspace_id}/ai/profile
        PUT    /workspaces/{workspace_id}/ai/profile
        POST   /workspaces/{workspace_id}/ai/profile/analyze  - Analyze content for profile

        # AI Onboarding
        GET    /workspaces/{workspace_id}/ai/onboarding/question  - Get next question
        POST   /workspaces/{workspace_id}/ai/onboarding/answer    - Submit answer

        # AI Generation
        POST   /workspaces/{workspace_id}/ai/improve-block   - Improve block content
        POST   /workspaces/{workspace_id}/ai/generate-blocks - Generate page blocks
        POST   /workspaces/{workspace_id}/ai/generate-image  - Generate an image
        POST   /workspaces/{workspace_id}/ai/suggest-workflow-step - Suggest next workflow step
        POST   /workspaces/{workspace_id}/ai/generate-page-workflow - Generate complete workflow for a page
        POST   /workspaces/{workspace_id}/ai/generate-workflow - Generate workflow from NL
        POST   /workspaces/{workspace_id}/ai/autofill-node - Autofill empty workflow node config fields
        POST   /workspaces/{workspace_id}/ai/analyze-domain - Analyze domain website for brand info
        POST   /workspaces/{workspace_id}/ai/generate-page-content - Generate page content from description
        POST   /workspaces/{workspace_id}/ai/refine-page-content - Refine generated content with feedback
        POST   /workspaces/{workspace_id}/ai/synthesize-page - Unified synthesis engine for complete page
        POST   /workspaces/{workspace_id}/ai/synthesize-page/plan - Plan phase (fast, 1 Haiku call)
        POST   /workspaces/{workspace_id}/ai/synthesize-page/generate - Generate phase (batch of ≤3 blocks)
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        # Extract page_id and site_id from query params if present
        query_params = event.get("queryStringParameters") or {}
        page_id = query_params.get("page_id")
        site_id = query_params.get("site_id")

        # Route to appropriate handler
        if "/ai/profile/analyze" in path and http_method == "POST":
            return analyze_content_for_profile(workspace_id, event, page_id, site_id)
        elif "/ai/profile" in path:
            if http_method == "GET":
                return get_business_profile(workspace_id, page_id, site_id)
            elif http_method == "PUT":
                return update_business_profile(workspace_id, event, page_id, site_id)
        elif "/ai/onboarding/question" in path and http_method == "GET":
            return get_onboarding_question(workspace_id)
        elif "/ai/onboarding/answer" in path and http_method == "POST":
            return submit_onboarding_answer(workspace_id, event)
        elif "/ai/improve-block" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return improve_block(workspace_id, event)
        elif "/ai/generate-blocks" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return generate_blocks(workspace_id, event)
        elif "/ai/generate-image" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id, action="ai_image")
            return generate_image(workspace_id, event)
        elif "/ai/suggest-workflow-step" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return suggest_workflow_step(workspace_id, event)
        elif "/ai/generate-page-workflow" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return generate_page_workflow(workspace_id, event)
        elif "/ai/generate-workflow" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return generate_workflow(workspace_id, event)
        elif "/ai/autofill-node" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return autofill_node(workspace_id, event)
        elif "/ai/analyze-domain" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return analyze_domain(workspace_id, event)
        elif "/ai/generate-page-content" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return generate_page_content(workspace_id, event)
        elif "/ai/refine-page-content" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return refine_page_content(workspace_id, event)
        elif "/ai/synthesize-page/plan" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return synthesize_plan(workspace_id, event)
        elif "/ai/synthesize-page/generate" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return synthesize_generate(workspace_id, event)
        elif "/ai/synthesize-page" in path and http_method == "POST":
            _check_ai_rate_limit(auth, workspace_id)
            return synthesize_page(workspace_id, event)
        else:
            return error("Not found", 404)

    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except _AIRateLimitExceeded:
        return error("AI generation rate limit exceeded. Please wait and try again.", 429)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("AI handler error", error=str(e))
        return error("Internal server error", 500)


def get_business_profile(
    workspace_id: str,
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Get the business profile for a workspace, site, or page.

    Uses cascade read (page → site → workspace) so we always return the
    most specific profile available WITHOUT creating empty ones as a
    side-effect. Only PUT should create profiles.
    """
    repo = BusinessProfileRepository()

    try:
        profile = repo.get_effective_profile(workspace_id, page_id, site_id)
        if not profile:
            # Return a transient empty profile (not persisted) so the
            # frontend gets a valid shape with profile_score = 0
            from complens.models.business_profile import BusinessProfile
            profile = BusinessProfile(workspace_id=workspace_id)
        profile.calculate_profile_score()
        return success(profile.model_dump(mode="json"))
    except Exception as e:
        logger.error(
            "Failed to load business profile",
            workspace_id=workspace_id,
            page_id=page_id,
            site_id=site_id,
            error=str(e),
        )
        return error(f"Failed to load profile: {str(e)}", 500)


def update_business_profile(
    workspace_id: str,
    event: dict,
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Update the business profile."""
    repo = BusinessProfileRepository()
    profile = repo.get_or_create(workspace_id, page_id, site_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateBusinessProfileRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Apply updates
    for field, value in request.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(profile, field, value)

    profile = repo.update_profile(profile)

    logger.info(
        "Business profile updated",
        workspace_id=workspace_id,
        profile_score=profile.profile_score,
    )

    return success(profile.model_dump(mode="json"))


def analyze_content_for_profile(
    workspace_id: str,
    event: dict,
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Analyze pasted content to extract profile information."""
    try:
        body = json.loads(event.get("body", "{}"))
        content = body.get("content", "")
        # Allow page_id/site_id from body to override query param
        page_id = body.get("page_id", page_id)
        site_id = body.get("site_id", site_id)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not content:
        return error("Content is required", 400)

    if len(content) > 50000:
        return error("Content too long (max 50,000 characters)", 400)

    try:
        extracted = ai_service.analyze_content_for_profile(workspace_id, content)

        # Optionally auto-update the profile
        if body.get("auto_update", False):
            repo = BusinessProfileRepository()
            profile = repo.get_or_create(workspace_id, page_id, site_id)

            for field, value in extracted.items():
                if value and hasattr(profile, field):
                    setattr(profile, field, value)

            profile = repo.update_profile(profile)
            return success({
                "extracted": extracted,
                "profile": profile.model_dump(mode="json"),
            })

        return success({"extracted": extracted})

    except Exception as e:
        logger.error("Content analysis failed", error=str(e))
        return error(f"Analysis failed: {str(e)}", 500)


def get_onboarding_question(workspace_id: str) -> dict:
    """Get the next onboarding question using AI."""
    repo = BusinessProfileRepository()
    profile = repo.get_effective_profile(workspace_id)
    if not profile:
        # First onboarding — create a workspace-level profile
        profile = repo.get_or_create(workspace_id)

    # If onboarding is complete, return status
    if profile.onboarding_completed:
        return success({
            "is_complete": True,
            "profile_score": profile.profile_score,
        })

    # Use AI to generate the next question based on conversation history
    try:
        if len(profile.conversation_history) < 2:
            # Start with basic questions
            question_index = len(profile.conversation_history)
            if question_index < len(ONBOARDING_QUESTIONS):
                q = ONBOARDING_QUESTIONS[question_index]
                return success({
                    "question": q.question,
                    "field": q.field,
                    "input_type": q.input_type,
                    "options": q.options,
                    "placeholder": q.placeholder,
                    "is_complete": False,
                    "progress": len(profile.conversation_history),
                })

        # Use AI for smart follow-up questions
        next_q = ai_service.ask_onboarding_question(
            workspace_id,
            profile.conversation_history,
        )

        return success({
            "question": next_q.get("question", "Tell me more about your business."),
            "field": next_q.get("field", "ai_notes"),
            "input_type": next_q.get("input_type", "textarea"),
            "options": next_q.get("options"),
            "is_complete": next_q.get("is_complete", False),
            "progress": len(profile.conversation_history),
        })

    except Exception as e:
        logger.error("Failed to get onboarding question", error=str(e))
        # Fallback to static questions
        return success({
            "question": "Tell me about your business and what you do.",
            "field": "description",
            "input_type": "textarea",
            "is_complete": False,
            "progress": len(profile.conversation_history),
        })


def submit_onboarding_answer(workspace_id: str, event: dict) -> dict:
    """Submit an answer to an onboarding question."""
    try:
        body = json.loads(event.get("body", "{}"))
        question = body.get("question", "")
        answer = body.get("answer", "")
        field = body.get("field")
        mark_complete = body.get("mark_complete", False)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not answer:
        return error("Answer is required", 400)

    repo = BusinessProfileRepository()
    profile = repo.get_or_create(workspace_id)

    # Add to conversation history
    profile = repo.add_conversation_entry(workspace_id, question, answer, field)

    # Update the specific field if provided
    if field and hasattr(profile, field):
        current_value = getattr(profile, field)

        # Handle list fields
        if isinstance(current_value, list):
            # Try to parse as comma-separated or newline-separated
            items = [
                item.strip()
                for item in answer.replace("\n", ",").split(",")
                if item.strip()
            ]
            setattr(profile, field, items)
        else:
            setattr(profile, field, answer)

        profile = repo.update_profile(profile)

    # Mark complete if requested
    if mark_complete:
        profile.onboarding_completed = True
        profile = repo.update_profile(profile)

    return success({
        "profile": profile.model_dump(mode="json"),
        "is_complete": profile.onboarding_completed,
    })


def improve_block(workspace_id: str, event: dict) -> dict:
    """Improve a block's content using AI."""
    try:
        body = json.loads(event.get("body", "{}"))
        block_type = body.get("block_type")
        current_config = body.get("config", {})
        page_context = body.get("page_context")
        instruction = body.get("instruction", "Improve this content to be more compelling")
        page_id = body.get("page_id")  # Page-specific profile
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not block_type:
        return error("block_type is required", 400)

    try:
        improved = ai_service.improve_block_content(
            workspace_id=workspace_id,
            block_type=block_type,
            current_config=current_config,
            page_context=page_context,
            instruction=instruction,
            page_id=page_id,
            site_id=site_id,
        )

        return success({"config": improved})

    except Exception as e:
        logger.error("Block improvement failed", error=str(e))
        return error(f"AI improvement failed: {str(e)}", 500)


def generate_blocks(workspace_id: str, event: dict) -> dict:
    """Generate page blocks from a description."""
    try:
        body = json.loads(event.get("body", "{}"))
        description = body.get("description", "")
        style = body.get("style", "professional")
        include_form = body.get("include_form", True)
        include_chat = body.get("include_chat", False)
        page_id = body.get("page_id")  # Page-specific profile
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not description:
        return error("description is required", 400)

    try:
        blocks = ai_service.generate_page_blocks(
            workspace_id=workspace_id,
            description=description,
            style=style,
            include_form=include_form,
            include_chat=include_chat,
            page_id=page_id,
            site_id=site_id,
        )

        return success({"blocks": blocks})

    except Exception as e:
        logger.error("Block generation failed", error=str(e))
        return error(f"AI generation failed: {str(e)}", 500)


def generate_image(workspace_id: str, event: dict) -> dict:
    """Generate an image using AI."""
    try:
        body = json.loads(event.get("body", "{}"))
        context = body.get("context", "")  # What the image should represent
        prompt = body.get("prompt")  # Direct prompt (optional)
        style = body.get("style", "professional")
        colors = body.get("colors")  # Optional color palette dict
        width = body.get("width", 1024)
        height = body.get("height", 1024)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not context and not prompt:
        return error("Either context or prompt is required", 400)

    # Validate and clamp dimensions for Titan Image Generator (320-4096, multiple of 64)
    width = max(320, min(4096, width))
    height = max(320, min(4096, height))
    # Round to nearest multiple of 64
    width = ((width + 32) // 64) * 64
    height = ((height + 32) // 64) * 64

    try:
        # Generate prompt from context if not provided
        if not prompt:
            prompt = ai_service.generate_image_prompt(workspace_id, context, style, colors=colors)

        logger.info("Generating image", prompt=prompt[:100], workspace_id=workspace_id)

        # Generate the image
        image_bytes = ai_service.generate_image(prompt, width, height)

        # Upload to S3
        image_id = str(uuid4())
        key = f"generated-images/{workspace_id}/{image_id}.png"

        s3.put_object(
            Bucket=ASSETS_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType="image/png",
        )

        # Generate URL
        # Note: In production, use CloudFront URL
        region = os.environ.get("AWS_REGION", "us-east-1")
        image_url = f"https://{ASSETS_BUCKET}.s3.{region}.amazonaws.com/{key}"

        logger.info(
            "Image generated and uploaded",
            workspace_id=workspace_id,
            image_url=image_url,
        )

        return success({
            "url": image_url,
            "prompt": prompt,
        })

    except NotImplementedError as e:
        # Image generation not available (model not enabled)
        logger.warning("Image generation not available", error=str(e))
        return error(str(e), 501)  # 501 Not Implemented
    except ValueError as e:
        # Content filter rejection or invalid prompt
        return error(str(e), 422)
    except Exception as e:
        logger.error("Image generation failed", error=str(e))
        return error(f"Image generation failed: {str(e)}", 500)


def suggest_workflow_step(workspace_id: str, event: dict) -> dict:
    """Suggest the next workflow step using AI."""
    try:
        body = json.loads(event.get("body", "{}"))
        nodes = body.get("nodes", [])
        edges = body.get("edges", [])
        source_node_id = body.get("source_node_id", "")
        page_id = body.get("page_id")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not source_node_id:
        return error("source_node_id is required", 400)

    if not nodes:
        return error("nodes array is required", 400)

    # Fetch workspace resources for context
    from complens.repositories.form import FormRepository
    from complens.repositories.page import PageRepository
    from complens.repositories.domain import DomainRepository

    forms_data = []
    pages_data = []
    domains_data = []

    try:
        form_repo = FormRepository()
        forms_result = form_repo.list_by_workspace(workspace_id, limit=20)
        forms_data = [
            {"id": f.get("id", ""), "name": f.get("name", "Unnamed Form")}
            for f in (forms_result if isinstance(forms_result, list) else forms_result.get("items", []))
        ]
    except Exception:
        pass

    try:
        page_repo = PageRepository()
        pages_result = page_repo.list_by_workspace(workspace_id, limit=20)
        pages_data = [
            {"id": p.get("id", ""), "name": p.get("name", "Unnamed Page")}
            for p in (pages_result if isinstance(pages_result, list) else pages_result.get("items", []))
        ]
    except Exception:
        pass

    try:
        domain_repo = DomainRepository()
        domain_items = domain_repo.list_by_workspace(workspace_id, limit=20)
        domains_data = [
            d.domain_name if hasattr(d, "domain_name") else d.get("domain_name", "")
            for d in (domain_items if isinstance(domain_items, list) else [])
            if (hasattr(d, "status") and d.status == "verified") or
               (isinstance(d, dict) and d.get("status") == "verified")
        ]
    except Exception:
        pass

    try:
        suggestions = ai_service.suggest_next_workflow_step(
            workspace_id=workspace_id,
            nodes=nodes,
            edges=edges,
            source_node_id=source_node_id,
            page_id=page_id,
            forms=forms_data if forms_data else None,
            pages=pages_data if pages_data else None,
            domains=domains_data if domains_data else None,
            site_id=site_id,
        )

        logger.info(
            "Workflow step suggestions generated",
            workspace_id=workspace_id,
            source_node_id=source_node_id,
            suggestion_count=len(suggestions),
        )

        return success({"suggestions": suggestions})

    except Exception as e:
        logger.error("Workflow step suggestion failed", error=str(e))
        return error(f"Suggestion failed: {str(e)}", 500)


def generate_page_workflow(workspace_id: str, event: dict) -> dict:
    """Generate a complete workflow for a landing page.

    Fetches the page, its forms, business profile, and verified domains,
    then asks AI to generate a full multi-node workflow with all configs
    pre-filled so the user can activate immediately.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        page_id = body.get("page_id", "")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not page_id:
        return error("page_id is required", 400)

    from complens.repositories.page import PageRepository
    from complens.repositories.form import FormRepository
    from complens.repositories.domain import DomainRepository
    from complens.repositories.workspace import WorkspaceRepository

    # Fetch page
    page_repo = PageRepository()
    page = page_repo.get_by_id(workspace_id, page_id)
    if not page:
        return error("Page not found", 404)

    page_data = page if isinstance(page, dict) else page.model_dump(mode="json") if hasattr(page, "model_dump") else vars(page)

    # Fetch forms for this page
    forms_data = []
    try:
        form_repo = FormRepository()
        forms_result = form_repo.list_by_page(page_id)
        raw_forms = forms_result if isinstance(forms_result, list) else forms_result.get("items", [])
        for f in raw_forms:
            fd = f if isinstance(f, dict) else f.model_dump(mode="json") if hasattr(f, "model_dump") else vars(f)
            forms_data.append({
                "id": fd.get("id", ""),
                "name": fd.get("name", "Unnamed Form"),
                "fields": fd.get("fields", []),
                "add_tags": fd.get("add_tags", []),
            })
    except Exception as e:
        logger.warning("Failed to fetch forms for page workflow", page_id=page_id, error=str(e))

    # Fetch verified domains
    domains_data = []
    try:
        domain_repo = DomainRepository()
        domain_items = domain_repo.list_by_workspace(workspace_id, limit=20)
        for d in (domain_items if isinstance(domain_items, list) else []):
            status = d.status if hasattr(d, "status") else d.get("status", "")
            name = d.domain_name if hasattr(d, "domain_name") else d.get("domain_name", "")
            if status == "verified" and name:
                domains_data.append(name)
    except Exception:
        pass

    # Resolve from_email and owner_email from workspace settings
    from_email = None
    owner_email = None
    try:
        ws_repo = WorkspaceRepository()
        workspace = ws_repo.get_by_id(workspace_id)
        if workspace:
            from_email = workspace.from_email if hasattr(workspace, "from_email") else None
            owner_email = workspace.notification_email if hasattr(workspace, "notification_email") else None
    except Exception:
        pass

    try:
        result = ai_service.generate_page_workflow(
            workspace_id=workspace_id,
            page_id=page_id,
            page=page_data,
            forms=forms_data,
            domains=domains_data if domains_data else None,
            from_email=from_email,
            owner_email=owner_email,
            site_id=site_id,
        )

        logger.info(
            "Page workflow generated",
            workspace_id=workspace_id,
            page_id=page_id,
            node_count=len(result.get("nodes", [])),
        )

        return success({"workflow": result})

    except Exception as e:
        logger.error("Page workflow generation failed", error=str(e))
        return error(f"Page workflow generation failed: {str(e)}", 500)


def generate_workflow(workspace_id: str, event: dict) -> dict:
    """Generate a workflow from natural language description."""
    try:
        body = json.loads(event.get("body", "{}"))
        description = body.get("description", "")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not description:
        return error("description is required", 400)

    try:
        workflow = ai_service.generate_workflow_from_description(
            workspace_id=workspace_id,
            description=description,
            site_id=site_id,
        )

        return success({"workflow": workflow})

    except Exception as e:
        logger.error("Workflow generation failed", error=str(e))
        return error(f"Workflow generation failed: {str(e)}", 500)


def autofill_node(workspace_id: str, event: dict) -> dict:
    """Autofill empty fields in a workflow node's configuration.

    Uses AI to suggest smart defaults for unconfigured node fields based on
    the node type, preceding workflow context, and business profile.

    Request body:
        node_type: The workflow node type (required)
        current_config: Current (possibly empty) config dict (required)
        nodes: All workflow nodes [{id, type, data: {label, nodeType, config}}]
        edges: All workflow edges [{source, target}]
        node_id: The ID of the node being autofilled (required to trace predecessors)
    """
    try:
        body = json.loads(event.get("body", "{}"))
        node_type = body.get("node_type", "")
        current_config = body.get("current_config", {})
        nodes = body.get("nodes", [])
        edges = body.get("edges", [])
        node_id = body.get("node_id", "")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not node_type:
        return error("node_type is required", 400)

    # Build preceding_nodes by tracing edges backward from the target node
    preceding_nodes = []
    if node_id and nodes and edges:
        # Build a lookup of node ID -> node data
        node_map = {}
        for n in nodes:
            nid = n.get("id", "")
            data = n.get("data", {})
            node_map[nid] = {
                "type": data.get("nodeType", n.get("type", "")),
                "label": data.get("label", ""),
                "config": data.get("config", {}),
            }

        # Walk backward through edges to collect predecessors in order
        visited = set()
        queue = [node_id]
        while queue:
            current = queue.pop(0)
            for edge in edges:
                if edge.get("target") == current:
                    source = edge.get("source", "")
                    if source and source not in visited and source in node_map:
                        visited.add(source)
                        preceding_nodes.append(node_map[source])
                        queue.append(source)

        # Reverse so earliest ancestors come first
        preceding_nodes.reverse()

    # Optionally fetch business profile for richer context (cascade read)
    business_profile = None
    try:
        repo = BusinessProfileRepository()
        profile = repo.get_effective_profile(workspace_id, site_id=site_id)
        if profile:
            business_profile = profile.model_dump(mode="json")
    except Exception:
        pass

    try:
        suggested = ai_service.autofill_node_config(
            workspace_id=workspace_id,
            node_type=node_type,
            current_config=current_config,
            preceding_nodes=preceding_nodes,
            business_profile=business_profile,
            site_id=site_id,
        )

        logger.info(
            "Node config autofilled",
            workspace_id=workspace_id,
            node_type=node_type,
            fields_suggested=len(suggested),
        )

        return success({"suggested_config": suggested})

    except Exception as e:
        logger.error("Node autofill failed", error=str(e))
        return error(f"Autofill failed: {str(e)}", 500)


def analyze_domain(workspace_id: str, event: dict) -> dict:
    """Analyze a domain's website to extract brand and business information.

    Fetches the domain homepage, extracts text content, and uses AI to
    identify business name, industry, tagline, target audience, tone,
    key features, and services.

    Request body:
        domain: The domain to analyze (required)
        site_id: Optional site ID for scoping the profile
    """
    try:
        body = json.loads(event.get("body", "{}"))
        domain = body.get("domain", "").strip()
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not domain:
        return error("domain is required", 400)

    # Fetch and extract content from the domain
    from complens.services.document_processor import extract_from_url

    url = f"https://{domain}" if not domain.startswith("http") else domain
    try:
        content = extract_from_url(url)
    except Exception as e:
        logger.warning("Failed to fetch domain content", domain=domain, error=str(e))
        return error(f"Could not fetch domain: {str(e)}", 422)

    if not content or len(content.strip()) < 50:
        return error("Could not extract enough content from the domain", 422)

    # Truncate content to avoid token limits
    content = content[:15000]

    # Use AI to analyze the content
    try:
        analysis = ai_service.analyze_domain_content(
            workspace_id=workspace_id,
            domain=domain,
            content=content,
        )

        # Optionally auto-update the business profile
        if body.get("auto_update", False):
            repo = BusinessProfileRepository()
            profile = repo.get_or_create(workspace_id, site_id=site_id)
            for field, value in analysis.items():
                if value and hasattr(profile, field):
                    current = getattr(profile, field)
                    # Only fill empty fields
                    if not current or (isinstance(current, list) and len(current) == 0):
                        setattr(profile, field, value)
            profile = repo.update_profile(profile)
            return success({
                "analysis": analysis,
                "profile": profile.model_dump(mode="json"),
            })

        return success({"analysis": analysis})

    except Exception as e:
        logger.error("Domain analysis failed", domain=domain, error=str(e))
        return error(f"Domain analysis failed: {str(e)}", 500)


def generate_page_content(workspace_id: str, event: dict) -> dict:
    """Generate rich page content from a business description.

    This is the main endpoint for the AI page builder wizard.
    Takes a free-form business description and generates:
    - Business info (type, industry, audience, tone)
    - Headlines (multiple options)
    - Features with descriptions
    - FAQ content
    - Testimonial concepts
    - Color suggestions
    """
    try:
        body = json.loads(event.get("body", "{}"))
        business_description = body.get("business_description", "")
        page_id = body.get("page_id")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not business_description:
        return error("business_description is required", 400)

    if len(business_description) > 10000:
        return error("business_description too long (max 10,000 characters)", 400)

    try:
        content = ai_service.generate_page_content_from_description(
            workspace_id=workspace_id,
            business_description=business_description,
            page_id=page_id,
            site_id=site_id,
        )

        logger.info(
            "Page content generated",
            workspace_id=workspace_id,
            has_business_info="business_info" in content,
            has_content="content" in content,
        )

        return success(content)

    except Exception as e:
        logger.error("Page content generation failed", error=str(e))
        return error(f"Content generation failed: {str(e)}", 500)


def refine_page_content(workspace_id: str, event: dict) -> dict:
    """Refine previously generated page content based on feedback.

    Allows users to request changes like "make the headline more punchy"
    or "make the tone more friendly" and get updated content.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        current_content = body.get("current_content", {})
        feedback = body.get("feedback", "")
        section = body.get("section")  # Optional: headlines, features, faq, etc.
        page_id = body.get("page_id")
        site_id = body.get("site_id")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not current_content:
        return error("current_content is required", 400)

    if not feedback:
        return error("feedback is required", 400)

    try:
        refined = ai_service.refine_page_content(
            workspace_id=workspace_id,
            current_content=current_content,
            feedback=feedback,
            section=section,
            page_id=page_id,
            site_id=site_id,
        )

        logger.info(
            "Page content refined",
            workspace_id=workspace_id,
            section=section,
        )

        return success(refined)

    except Exception as e:
        logger.error("Page content refinement failed", error=str(e))
        return error(f"Content refinement failed: {str(e)}", 500)


def synthesize_plan(workspace_id: str, event: dict) -> dict:
    """Plan phase of two-phase synthesis.

    Runs intent analysis, content assessment, block planning, design system,
    and brand foundation (single Haiku call). Returns everything the frontend
    needs to preview before generation.

    Request body:
        description: Business/page description (required)
        intent_hints: Optional hints like ['lead-gen', 'portfolio']
        style_preference: Optional style like 'professional', 'bold'
        page_id: Existing page ID for update mode
        block_types: Optional specific block types to plan

    Returns:
        PlanResult with intent, block plan, design, brand, SEO
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = SynthesizePlanRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    try:
        engine = SynthesisEngine()
        result = engine.plan(
            workspace_id=workspace_id,
            description=request.description,
            page_id=request.page_id,
            intent_hints=request.intent_hints,
            style_preference=request.style_preference,
            block_types=request.block_types,
            existing_block_types=request.existing_block_types,
            site_id=request.site_id,
        )

        logger.info(
            "Plan phase complete",
            workspace_id=workspace_id,
            plan_id=result.plan_id,
            blocks_planned=len(result.block_plan),
        )

        return success(result.model_dump(mode="json"))

    except Exception as e:
        logger.error("Plan phase failed", error=str(e))
        return error(f"Plan phase failed: {str(e)}", 500)


def synthesize_generate(workspace_id: str, event: dict) -> dict:
    """Generate phase of two-phase synthesis.

    Takes brand/design from plan phase and generates content for a batch
    of up to 3 block types. Called 1-2 times by the frontend.

    Request body:
        description: Business/page description (required)
        brand: BrandFoundation from plan phase
        design_system: DesignSystem from plan phase
        intent: PageIntent from plan phase
        block_types: Block types to generate (max 3)
        page_id: Optional page ID
        include_form: Whether to include form/workflow config

    Returns:
        GenerateResult with blocks and optional form/workflow config
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = SynthesizeGenerateRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    try:
        engine = SynthesisEngine()
        result = engine.generate(
            workspace_id=workspace_id,
            description=request.description,
            brand=request.brand,
            design=request.design_system,
            intent=request.intent,
            block_types=request.block_types,
            page_id=request.page_id,
            include_form=request.include_form,
            site_id=request.site_id,
        )

        logger.info(
            "Generate phase complete",
            workspace_id=workspace_id,
            blocks_generated=len(result.blocks),
        )

        return success(result.model_dump(mode="json"))

    except Exception as e:
        logger.error("Generate phase failed", error=str(e))
        return error(f"Generate phase failed: {str(e)}", 500)


def synthesize_page(workspace_id: str, event: dict) -> dict:
    """Synthesize a complete page using the unified synthesis engine.

    This is the main endpoint for intelligent page generation. It uses a
    multi-stage pipeline to create cohesive, high-conversion landing pages:

    1. Intent Analysis - Understand what kind of page is needed
    2. Content Assessment - Score available content quality
    3. Block Planning - Decide which blocks to include/exclude
    4. Design System - Generate industry-aware colors and styling
    5. Content Synthesis - Single AI call for cross-block coherence
    6. Block Configuration - Build validated PageBlock list

    Request body:
        description: Business/page description (required)
        intent_hints: Optional hints like ['lead-gen', 'portfolio']
        style_preference: Optional style like 'professional', 'bold'
        page_id: Existing page ID for update mode
        include_form: Whether to include form (default: True)
        include_chat: Whether to include chat (default: True)

    Returns:
        SynthesisResult with blocks, form_config, workflow_config, metadata
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = SynthesizePageRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    try:
        engine = SynthesisEngine()
        result = engine.synthesize(
            workspace_id=workspace_id,
            description=request.description,
            page_id=request.page_id,
            intent_hints=request.intent_hints,
            style_preference=request.style_preference,
            include_form=request.include_form,
            include_chat=request.include_chat,
            block_types=request.block_types,
            site_id=request.site_id,
        )

        logger.info(
            "Page synthesized",
            workspace_id=workspace_id,
            synthesis_id=result.synthesis_id,
            blocks_count=len(result.blocks),
            excluded_count=len(result.metadata.blocks_excluded),
        )

        return success(result.model_dump(mode="json"))

    except Exception as e:
        logger.error("Page synthesis failed", error=str(e))
        return error(f"Page synthesis failed: {str(e)}", 500)
