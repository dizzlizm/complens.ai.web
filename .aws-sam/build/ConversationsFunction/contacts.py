"""Contacts API handler."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.contact import Contact, CreateContactRequest, UpdateContactRequest
from complens.repositories.contact import ContactRepository
from complens.utils.auth import get_auth_context, require_workspace_access, get_workspace_id_from_path
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle contacts API requests.

    Routes:
        GET    /workspaces/{workspace_id}/contacts
        POST   /workspaces/{workspace_id}/contacts
        GET    /workspaces/{workspace_id}/contacts/{contact_id}
        PUT    /workspaces/{workspace_id}/contacts/{contact_id}
        DELETE /workspaces/{workspace_id}/contacts/{contact_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        contact_id = path_params.get("contact_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = ContactRepository()

        # Route to appropriate handler
        if http_method == "GET" and contact_id:
            return get_contact(repo, workspace_id, contact_id)
        elif http_method == "GET":
            return list_contacts(repo, workspace_id, event)
        elif http_method == "POST":
            return create_contact(repo, workspace_id, event)
        elif http_method == "PUT" and contact_id:
            return update_contact(repo, workspace_id, contact_id, event)
        elif http_method == "DELETE" and contact_id:
            return delete_contact(repo, workspace_id, contact_id)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Contacts handler error", error=str(e))
        return error("Internal server error", 500)


def list_contacts(
    repo: ContactRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List contacts in a workspace.

    Query params:
        limit: Max results (default 50)
        cursor: Pagination cursor
        tag: Filter by tag
    """
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)
    cursor = query_params.get("cursor")
    tag = query_params.get("tag")

    # Decode cursor if provided
    last_key = None
    if cursor:
        import base64
        last_key = json.loads(base64.b64decode(cursor).decode())

    if tag:
        contacts = repo.list_by_tag(workspace_id, tag, limit)
        next_cursor = None
    else:
        contacts, next_key = repo.list_by_workspace(workspace_id, limit, last_key)
        # Encode next cursor
        next_cursor = None
        if next_key:
            import base64
            next_cursor = base64.b64encode(json.dumps(next_key).encode()).decode()

    return success({
        "items": [c.model_dump(mode="json") for c in contacts],
        "pagination": {
            "limit": limit,
            "next_cursor": next_cursor,
        },
    })


def get_contact(
    repo: ContactRepository,
    workspace_id: str,
    contact_id: str,
) -> dict:
    """Get a single contact by ID."""
    contact = repo.get_by_id(workspace_id, contact_id)
    if not contact:
        return not_found("Contact", contact_id)

    return success(contact.model_dump(mode="json"))


def create_contact(
    repo: ContactRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new contact."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateContactRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Check for existing contact with same email
    if request.email:
        existing = repo.get_by_email(workspace_id, request.email)
        if existing:
            return error(
                f"Contact with email {request.email} already exists",
                409,
                error_code="DUPLICATE_EMAIL",
            )

    # Check for existing contact with same phone
    if request.phone:
        existing = repo.get_by_phone(workspace_id, request.phone)
        if existing:
            return error(
                f"Contact with phone {request.phone} already exists",
                409,
                error_code="DUPLICATE_PHONE",
            )

    # Create contact
    contact = Contact(
        workspace_id=workspace_id,
        **request.model_dump(),
    )

    contact = repo.create_contact(contact)

    logger.info("Contact created", contact_id=contact.id, workspace_id=workspace_id)

    return created(contact.model_dump(mode="json"))


def update_contact(
    repo: ContactRepository,
    workspace_id: str,
    contact_id: str,
    event: dict,
) -> dict:
    """Update an existing contact."""
    # Get existing contact
    contact = repo.get_by_id(workspace_id, contact_id)
    if not contact:
        return not_found("Contact", contact_id)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateContactRequest.model_validate(body)
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
            setattr(contact, field, value)

    # Save
    contact = repo.update_contact(contact)

    logger.info("Contact updated", contact_id=contact_id, workspace_id=workspace_id)

    return success(contact.model_dump(mode="json"))


def delete_contact(
    repo: ContactRepository,
    workspace_id: str,
    contact_id: str,
) -> dict:
    """Delete a contact."""
    deleted = repo.delete_contact(workspace_id, contact_id)

    if not deleted:
        return not_found("Contact", contact_id)

    logger.info("Contact deleted", contact_id=contact_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": contact_id})
