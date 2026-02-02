"""AI API handler for contextual AI operations.

Provides endpoints for:
- Business profile management
- AI onboarding
- Block content improvement
- Image generation
- Workflow generation from natural language
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
from complens.repositories.business_profile import BusinessProfileRepository
from complens.services import ai_service
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()

# S3 for image storage
ASSETS_BUCKET = os.environ.get("ASSETS_BUCKET", "")
s3 = boto3.client("s3")


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
        POST   /workspaces/{workspace_id}/ai/generate-workflow - Generate workflow from NL
        POST   /workspaces/{workspace_id}/ai/generate-page-content - Generate page content from description
        POST   /workspaces/{workspace_id}/ai/refine-page-content - Refine generated content with feedback
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

        # Extract page_id from query params if present
        query_params = event.get("queryStringParameters") or {}
        page_id = query_params.get("page_id")

        # Route to appropriate handler
        if "/ai/profile/analyze" in path and http_method == "POST":
            return analyze_content_for_profile(workspace_id, event, page_id)
        elif "/ai/profile" in path:
            if http_method == "GET":
                return get_business_profile(workspace_id, page_id)
            elif http_method == "PUT":
                return update_business_profile(workspace_id, event, page_id)
        elif "/ai/onboarding/question" in path and http_method == "GET":
            return get_onboarding_question(workspace_id)
        elif "/ai/onboarding/answer" in path and http_method == "POST":
            return submit_onboarding_answer(workspace_id, event)
        elif "/ai/improve-block" in path and http_method == "POST":
            return improve_block(workspace_id, event)
        elif "/ai/generate-blocks" in path and http_method == "POST":
            return generate_blocks(workspace_id, event)
        elif "/ai/generate-image" in path and http_method == "POST":
            return generate_image(workspace_id, event)
        elif "/ai/generate-workflow" in path and http_method == "POST":
            return generate_workflow(workspace_id, event)
        elif "/ai/generate-page-content" in path and http_method == "POST":
            return generate_page_content(workspace_id, event)
        elif "/ai/refine-page-content" in path and http_method == "POST":
            return refine_page_content(workspace_id, event)
        else:
            return error("Not found", 404)

    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("AI handler error", error=str(e))
        return error("Internal server error", 500)


def get_business_profile(workspace_id: str, page_id: str | None = None) -> dict:
    """Get the business profile for a workspace or page."""
    repo = BusinessProfileRepository()

    try:
        profile = repo.get_or_create(workspace_id, page_id)
        return success(profile.model_dump(mode="json"))
    except Exception as e:
        # If profile is corrupted, try to reset it
        logger.warning(
            "Failed to load business profile, attempting reset",
            workspace_id=workspace_id,
            page_id=page_id,
            error=str(e),
        )
        try:
            # Delete corrupted profile and create fresh one
            repo.delete_profile(workspace_id, page_id)
            from complens.models.business_profile import BusinessProfile
            profile = BusinessProfile(workspace_id=workspace_id, page_id=page_id)
            profile = repo.create_profile(profile, page_id)
            logger.info("Reset corrupted business profile", workspace_id=workspace_id, page_id=page_id)
            return success(profile.model_dump(mode="json"))
        except Exception as reset_error:
            logger.error("Failed to reset business profile", error=str(reset_error))
            return error(f"Profile data corrupted: {str(e)}", 500)


def update_business_profile(workspace_id: str, event: dict, page_id: str | None = None) -> dict:
    """Update the business profile."""
    repo = BusinessProfileRepository()
    profile = repo.get_or_create(workspace_id, page_id)

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


def analyze_content_for_profile(workspace_id: str, event: dict, page_id: str | None = None) -> dict:
    """Analyze pasted content to extract profile information."""
    try:
        body = json.loads(event.get("body", "{}"))
        content = body.get("content", "")
        # Allow page_id from body to override query param
        page_id = body.get("page_id", page_id)
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
            profile = repo.get_or_create(workspace_id, page_id)

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
        width = body.get("width", 1024)
        height = body.get("height", 1024)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not context and not prompt:
        return error("Either context or prompt is required", 400)

    try:
        # Generate prompt from context if not provided
        if not prompt:
            prompt = ai_service.generate_image_prompt(workspace_id, context, style)

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
    except Exception as e:
        logger.error("Image generation failed", error=str(e))
        return error(f"Image generation failed: {str(e)}", 500)


def generate_workflow(workspace_id: str, event: dict) -> dict:
    """Generate a workflow from natural language description."""
    try:
        body = json.loads(event.get("body", "{}"))
        description = body.get("description", "")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not description:
        return error("description is required", 400)

    try:
        workflow = ai_service.generate_workflow_from_description(
            workspace_id=workspace_id,
            description=description,
        )

        return success({"workflow": workflow})

    except Exception as e:
        logger.error("Workflow generation failed", error=str(e))
        return error(f"Workflow generation failed: {str(e)}", 500)


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
