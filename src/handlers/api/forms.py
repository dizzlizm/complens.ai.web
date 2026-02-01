"""Forms API handler (admin, authenticated)."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.form import (
    CreateFormRequest,
    Form,
    FormField,
    UpdateFormRequest,
)
from complens.repositories.form import FormRepository, FormSubmissionRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle forms API requests.

    Routes:
        GET    /workspaces/{workspace_id}/forms
        POST   /workspaces/{workspace_id}/forms
        GET    /workspaces/{workspace_id}/forms/{form_id}
        PUT    /workspaces/{workspace_id}/forms/{form_id}
        DELETE /workspaces/{workspace_id}/forms/{form_id}
        GET    /workspaces/{workspace_id}/forms/{form_id}/submissions
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        form_id = path_params.get("form_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = FormRepository()
        submission_repo = FormSubmissionRepository()

        # Route to appropriate handler
        if "/submissions" in path and http_method == "GET":
            # Verify form belongs to this workspace before listing submissions
            form = repo.get_by_id(workspace_id, form_id)
            if not form:
                return not_found("Form", form_id)
            return list_submissions(submission_repo, form_id, event)
        elif http_method == "GET" and form_id:
            return get_form(repo, workspace_id, form_id)
        elif http_method == "GET":
            return list_forms(repo, workspace_id, event)
        elif http_method == "POST":
            return create_form(repo, workspace_id, event)
        elif http_method == "PUT" and form_id:
            return update_form(repo, workspace_id, form_id, event)
        elif http_method == "DELETE" and form_id:
            return delete_form(repo, workspace_id, form_id)
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
        logger.exception("Forms handler error", error=str(e))
        return error("Internal server error", 500)


def list_forms(
    repo: FormRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List forms in a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)

    forms, next_key = repo.list_by_workspace(workspace_id, limit=limit)

    return success({
        "items": [f.model_dump(mode="json") for f in forms],
        "pagination": {
            "limit": limit,
        },
    })


def get_form(
    repo: FormRepository,
    workspace_id: str,
    form_id: str,
) -> dict:
    """Get a single form by ID."""
    form = repo.get_by_id(workspace_id, form_id)
    if not form:
        return not_found("Form", form_id)

    return success(form.model_dump(mode="json"))


def create_form(
    repo: FormRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new form."""
    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Create form request", workspace_id=workspace_id, body=body)
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

    # Create form
    form = Form(
        workspace_id=workspace_id,
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

    logger.info("Form created", form_id=form.id, workspace_id=workspace_id)

    return created(form.model_dump(mode="json"))


def update_form(
    repo: FormRepository,
    workspace_id: str,
    form_id: str,
    event: dict,
) -> dict:
    """Update an existing form."""
    # Get existing form
    form = repo.get_by_id(workspace_id, form_id)
    if not form:
        return not_found("Form", form_id)

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

    # Save
    form = repo.update_form(form)

    logger.info("Form updated", form_id=form_id, workspace_id=workspace_id)

    return success(form.model_dump(mode="json"))


def delete_form(
    repo: FormRepository,
    workspace_id: str,
    form_id: str,
) -> dict:
    """Delete a form."""
    deleted = repo.delete_form(workspace_id, form_id)

    if not deleted:
        return not_found("Form", form_id)

    logger.info("Form deleted", form_id=form_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": form_id})


def list_submissions(
    repo: FormSubmissionRepository,
    form_id: str,
    event: dict,
) -> dict:
    """List submissions for a form."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)

    submissions, next_key = repo.list_by_form(form_id, limit=limit)

    return success({
        "items": [s.model_dump(mode="json") for s in submissions],
        "pagination": {
            "limit": limit,
        },
    })
