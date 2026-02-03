"""Contacts API handler."""

import base64
import csv
import io
import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.contact import Contact, CreateContactRequest, UpdateContactRequest
from complens.models.contact_note import ContactNote, CreateContactNoteRequest, UpdateContactNoteRequest
from complens.repositories.contact import ContactRepository
from complens.repositories.contact_note import ContactNoteRepository
from complens.utils.auth import get_auth_context, require_workspace_access
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
        GET    /workspaces/{workspace_id}/contacts/{contact_id}/activity
        GET    /workspaces/{workspace_id}/contacts/{contact_id}/notes
        POST   /workspaces/{workspace_id}/contacts/{contact_id}/notes
        PUT    /workspaces/{workspace_id}/contacts/{contact_id}/notes/{note_id}
        DELETE /workspaces/{workspace_id}/contacts/{contact_id}/notes/{note_id}
        POST   /workspaces/{workspace_id}/contacts/import
        GET    /workspaces/{workspace_id}/contacts/export
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        resource = event.get("resource", "")
        workspace_id = path_params.get("workspace_id")
        contact_id = path_params.get("contact_id")
        note_id = path_params.get("note_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = ContactRepository()

        # Route based on resource path pattern
        if "/notes/" in resource and note_id:
            note_repo = ContactNoteRepository()
            if http_method == "PUT":
                return update_note(note_repo, contact_id, note_id, event)
            elif http_method == "DELETE":
                return delete_note(note_repo, contact_id, note_id)
            else:
                return error("Method not allowed", 405)

        if resource.endswith("/notes"):
            note_repo = ContactNoteRepository()
            if http_method == "GET":
                return list_notes(note_repo, contact_id, event)
            elif http_method == "POST":
                return create_note(note_repo, workspace_id, contact_id, auth, event)
            else:
                return error("Method not allowed", 405)

        if resource.endswith("/activity"):
            if http_method == "GET":
                return get_activity(workspace_id, contact_id, event)
            return error("Method not allowed", 405)

        if resource.endswith("/import"):
            if http_method == "POST":
                return import_contacts(repo, workspace_id, event)
            return error("Method not allowed", 405)

        if resource.endswith("/export"):
            if http_method == "GET":
                return export_contacts(repo, workspace_id)
            return error("Method not allowed", 405)

        # Standard CRUD routes
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


# =============================================================================
# Standard CRUD
# =============================================================================


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
        last_key = json.loads(base64.b64decode(cursor).decode())

    if tag:
        contacts = repo.list_by_tag(workspace_id, tag, limit)
        next_cursor = None
    else:
        contacts, next_key = repo.list_by_workspace(workspace_id, limit, last_key)
        next_cursor = None
        if next_key:
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


# =============================================================================
# Contact Notes
# =============================================================================


def list_notes(
    note_repo: ContactNoteRepository,
    contact_id: str,
    event: dict,
) -> dict:
    """List notes for a contact."""
    query_params = event.get("queryStringParameters", {}) or {}
    limit = min(int(query_params.get("limit", 50)), 100)

    notes, next_key = note_repo.list_by_contact(contact_id, limit)
    return success({
        "items": [n.model_dump(mode="json") for n in notes],
    })


def create_note(
    note_repo: ContactNoteRepository,
    workspace_id: str,
    contact_id: str,
    auth: Any,
    event: dict,
) -> dict:
    """Create a note on a contact."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateContactNoteRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    note = ContactNote(
        workspace_id=workspace_id,
        contact_id=contact_id,
        author_id=auth.user_id,
        author_name=auth.email or auth.user_id,
        content=request.content,
        pinned=request.pinned,
    )

    note = note_repo.create_note(note)

    logger.info("Contact note created", note_id=note.id, contact_id=contact_id)

    return created(note.model_dump(mode="json"))


def update_note(
    note_repo: ContactNoteRepository,
    contact_id: str,
    note_id: str,
    event: dict,
) -> dict:
    """Update a contact note."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateContactNoteRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Find the note - we need to query by contact to find it by note_id
    notes, _ = note_repo.list_by_contact(contact_id, limit=100)
    note = next((n for n in notes if n.id == note_id), None)
    if not note:
        return not_found("ContactNote", note_id)

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(note, field, value)

    note = note_repo.update_note(note)

    logger.info("Contact note updated", note_id=note_id, contact_id=contact_id)

    return success(note.model_dump(mode="json"))


def delete_note(
    note_repo: ContactNoteRepository,
    contact_id: str,
    note_id: str,
) -> dict:
    """Delete a contact note."""
    # Find the note to get the full SK
    notes, _ = note_repo.list_by_contact(contact_id, limit=100)
    note = next((n for n in notes if n.id == note_id), None)
    if not note:
        return not_found("ContactNote", note_id)

    note_repo.delete_note(contact_id, note.get_sk())

    logger.info("Contact note deleted", note_id=note_id, contact_id=contact_id)

    return success({"deleted": True, "id": note_id})


# =============================================================================
# Activity Timeline
# =============================================================================


def get_activity(
    workspace_id: str,
    contact_id: str,
    event: dict,
) -> dict:
    """Get aggregated activity timeline for a contact.

    Queries conversations, workflow runs, form submissions, and notes,
    then merges them by timestamp.
    """
    from complens.repositories.contact_note import ContactNoteRepository
    from complens.repositories.form import FormSubmissionRepository

    query_params = event.get("queryStringParameters", {}) or {}
    limit = min(int(query_params.get("limit", 50)), 100)

    activities: list[dict] = []

    # 1. Conversations (via GSI1: CONTACT#{contact_id})
    try:
        from complens.models.conversation import Conversation
        from complens.repositories.base import BaseRepository

        conv_repo = BaseRepository(Conversation)
        conversations, _ = conv_repo.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="CONV#",
            index_name="GSI1",
            limit=20,
            scan_forward=False,
        )
        for conv in conversations:
            activities.append({
                "type": "conversation",
                "summary": f"{conv.channel} conversation - {conv.status}",
                "data": {
                    "id": conv.id,
                    "channel": conv.channel,
                    "status": conv.status,
                    "message_count": conv.message_count,
                    "last_message_preview": conv.last_message_preview,
                },
                "timestamp": conv.created_at.isoformat(),
            })
    except Exception as e:
        logger.warning("Failed to fetch conversations for activity", error=str(e))

    # 2. Workflow runs (via GSI1: CONTACT#{contact_id})
    try:
        from complens.models.workflow_run import WorkflowRun
        from complens.repositories.base import BaseRepository

        run_repo = BaseRepository(WorkflowRun)
        runs, _ = run_repo.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="RUN#",
            index_name="GSI1",
            limit=20,
            scan_forward=False,
        )
        for run in runs:
            activities.append({
                "type": "workflow_run",
                "summary": f"Workflow run - {run.status}",
                "data": {
                    "id": run.id,
                    "workflow_id": run.workflow_id,
                    "status": run.status,
                    "trigger_type": run.trigger_type,
                    "steps_completed": run.steps_completed,
                },
                "timestamp": run.created_at.isoformat(),
            })
    except Exception as e:
        logger.warning("Failed to fetch workflow runs for activity", error=str(e))

    # 3. Form submissions (via GSI2: CONTACT#{contact_id})
    try:
        sub_repo = FormSubmissionRepository()
        submissions, _ = sub_repo.list_by_contact(contact_id, limit=20)
        for sub in submissions:
            activities.append({
                "type": "form_submission",
                "summary": f"Form submitted",
                "data": {
                    "id": sub.id,
                    "form_id": sub.form_id,
                    "page_id": sub.page_id,
                    "data": sub.data,
                },
                "timestamp": sub.created_at.isoformat(),
            })
    except Exception as e:
        logger.warning("Failed to fetch form submissions for activity", error=str(e))

    # 4. Notes
    try:
        note_repo = ContactNoteRepository()
        notes, _ = note_repo.list_by_contact(contact_id, limit=20)
        for note in notes:
            activities.append({
                "type": "note",
                "summary": note.content[:100],
                "data": {
                    "id": note.id,
                    "content": note.content,
                    "author_name": note.author_name,
                    "pinned": note.pinned,
                },
                "timestamp": note.created_at.isoformat(),
            })
    except Exception as e:
        logger.warning("Failed to fetch notes for activity", error=str(e))

    # Sort all activities by timestamp, most recent first
    activities.sort(key=lambda a: a["timestamp"], reverse=True)

    # Apply limit
    activities = activities[:limit]

    return success({"items": activities})


# =============================================================================
# Import / Export
# =============================================================================


def import_contacts(
    repo: ContactRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Import contacts from CSV data.

    Expects JSON body with:
        csv_data: string - Raw CSV content
        mapping: dict - Column name -> contact field mapping
    """
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    csv_data = body.get("csv_data")
    mapping = body.get("mapping", {})

    if not csv_data:
        return error("csv_data is required", 400)

    if not mapping:
        return error("mapping is required", 400)

    reader = csv.DictReader(io.StringIO(csv_data))

    imported = 0
    skipped = 0
    errors_list: list[dict] = []

    for row_num, row in enumerate(reader, start=2):
        try:
            contact_data: dict[str, Any] = {}
            custom_fields: dict[str, Any] = {}

            for csv_col, contact_field in mapping.items():
                value = row.get(csv_col, "").strip()
                if not value:
                    continue

                if contact_field in ("email", "phone", "first_name", "last_name", "source", "status"):
                    contact_data[contact_field] = value
                elif contact_field == "tags":
                    contact_data["tags"] = [t.strip() for t in value.split(",") if t.strip()]
                elif contact_field.startswith("custom_fields."):
                    field_name = contact_field.replace("custom_fields.", "")
                    custom_fields[field_name] = value
                else:
                    custom_fields[contact_field] = value

            if custom_fields:
                contact_data["custom_fields"] = custom_fields

            # Must have email or phone
            if not contact_data.get("email") and not contact_data.get("phone"):
                skipped += 1
                continue

            # Dedup by email
            if contact_data.get("email"):
                existing = repo.get_by_email(workspace_id, contact_data["email"])
                if existing:
                    skipped += 1
                    continue

            contact = Contact(workspace_id=workspace_id, **contact_data)
            repo.create_contact(contact)
            imported += 1

        except Exception as e:
            errors_list.append({"row": row_num, "error": str(e)})

    logger.info(
        "Contacts imported",
        workspace_id=workspace_id,
        imported=imported,
        skipped=skipped,
        errors=len(errors_list),
    )

    return success({
        "imported": imported,
        "skipped": skipped,
        "errors": errors_list,
    })


def export_contacts(
    repo: ContactRepository,
    workspace_id: str,
) -> dict:
    """Export all contacts as CSV."""
    all_contacts: list[Contact] = []
    last_key = None

    # Paginate through all contacts
    while True:
        contacts, next_key = repo.list_by_workspace(workspace_id, limit=100, last_key=last_key)
        all_contacts.extend(contacts)
        if not next_key:
            break
        last_key = next_key

    # Build CSV
    output = io.StringIO()
    fieldnames = [
        "id", "email", "phone", "first_name", "last_name",
        "status", "source", "tags", "sms_opt_in", "email_opt_in",
        "total_messages_sent", "total_messages_received",
        "last_contacted_at", "last_response_at",
        "created_at", "updated_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for contact in all_contacts:
        writer.writerow({
            "id": contact.id,
            "email": contact.email or "",
            "phone": contact.phone or "",
            "first_name": contact.first_name or "",
            "last_name": contact.last_name or "",
            "status": contact.status,
            "source": contact.source or "",
            "tags": ",".join(contact.tags),
            "sms_opt_in": str(contact.sms_opt_in),
            "email_opt_in": str(contact.email_opt_in),
            "total_messages_sent": contact.total_messages_sent,
            "total_messages_received": contact.total_messages_received,
            "last_contacted_at": contact.last_contacted_at or "",
            "last_response_at": contact.last_response_at or "",
            "created_at": contact.created_at.isoformat(),
            "updated_at": contact.updated_at.isoformat(),
        })

    csv_content = output.getvalue()

    return success({
        "csv_data": csv_content,
        "count": len(all_contacts),
    })
