"""Segment webhook handler.

Receives events from Segment (identify, track, page, etc.) and routes them
to create/update contacts and trigger workflows.

Segment Webhook Destination docs:
https://segment.com/docs/connections/destinations/catalog/webhooks/
"""

import base64
import hashlib
import hmac
import json
import os
from typing import Any

import boto3
import structlog

from complens.models.contact import Contact
from complens.repositories.contact import ContactRepository
from complens.repositories.workspace import WorkspaceRepository

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Segment webhook events.

    Segment sends events as JSON with types:
    - identify: Create/update contact
    - track: Custom event (triggers workflows)
    - page: Page view
    - screen: Mobile screen view
    - group: Associate user with group
    - alias: Link identities

    Routes:
        POST /webhooks/segment/{workspace_id}
    """
    try:
        # Get workspace ID from path
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        if not workspace_id:
            logger.warning("No workspace_id in path")
            return _json_response(400, {"error": "workspace_id required in path"})

        # Parse JSON body
        body = event.get("body", "")
        if event.get("isBase64Encoded", False):
            body = base64.b64decode(body).decode("utf-8")

        if not body:
            return _json_response(400, {"error": "Empty request body"})

        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            logger.warning("Invalid JSON body", error=str(e))
            return _json_response(400, {"error": "Invalid JSON"})

        # Validate Segment signature
        if not _validate_segment_signature(event, body, workspace_id):
            logger.warning("Invalid Segment signature", workspace_id=workspace_id)
            return _json_response(401, {"error": "Invalid signature"})

        # Verify workspace exists
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(workspace_id)
        if not workspace:
            logger.warning("Workspace not found", workspace_id=workspace_id)
            return _json_response(404, {"error": "Workspace not found"})

        # Route based on event type
        event_type = data.get("type", "").lower()

        logger.info(
            "Segment event received",
            workspace_id=workspace_id,
            event_type=event_type,
            message_id=data.get("messageId"),
        )

        if event_type == "identify":
            return handle_identify(workspace_id, data)
        elif event_type == "track":
            return handle_track(workspace_id, data)
        elif event_type == "page":
            return handle_page(workspace_id, data)
        elif event_type == "screen":
            return handle_screen(workspace_id, data)
        elif event_type == "group":
            return handle_group(workspace_id, data)
        elif event_type == "alias":
            return handle_alias(workspace_id, data)
        else:
            logger.warning("Unknown Segment event type", event_type=event_type)
            return _json_response(200, {"status": "ignored", "reason": "unknown type"})

    except Exception as e:
        logger.exception("Segment webhook error", error=str(e))
        return _json_response(500, {"error": "Internal server error"})


def handle_identify(workspace_id: str, data: dict) -> dict:
    """Handle Segment identify event - create or update contact.

    Args:
        workspace_id: Workspace ID.
        data: Segment identify payload.

    Returns:
        API response.
    """
    user_id = data.get("userId")
    anonymous_id = data.get("anonymousId")
    traits = data.get("traits", {})

    if not user_id and not anonymous_id:
        return _json_response(400, {"error": "userId or anonymousId required"})

    # Extract standard fields from traits
    email = traits.get("email")
    phone = traits.get("phone")
    first_name = traits.get("firstName") or traits.get("first_name")
    last_name = traits.get("lastName") or traits.get("last_name")
    name = traits.get("name")

    # Parse full name if first/last not provided
    if name and not (first_name and last_name):
        parts = name.split(" ", 1)
        first_name = first_name or parts[0]
        last_name = last_name or (parts[1] if len(parts) > 1 else None)

    contact_repo = ContactRepository()

    # Try to find existing contact
    contact = None

    # First try by email
    if email:
        contact = contact_repo.find_by_email(workspace_id, email)

    # Then try by phone
    if not contact and phone:
        contact = contact_repo.find_by_phone(workspace_id, phone)

    # Then try by external ID (Segment userId)
    if not contact and user_id:
        contact = _find_by_external_id(workspace_id, "segment", user_id)

    if contact:
        # Update existing contact
        updated = False

        if email and contact.email != email:
            contact.email = email
            updated = True
        if phone and contact.phone != phone:
            contact.phone = phone
            updated = True
        if first_name and contact.first_name != first_name:
            contact.first_name = first_name
            updated = True
        if last_name and contact.last_name != last_name:
            contact.last_name = last_name
            updated = True

        # Store Segment IDs in custom fields
        if user_id:
            contact.custom_fields["segment_user_id"] = user_id
            updated = True
        if anonymous_id:
            contact.custom_fields["segment_anonymous_id"] = anonymous_id
            updated = True

        # Store other traits as custom fields
        for key, value in traits.items():
            if key not in ["email", "phone", "firstName", "first_name",
                          "lastName", "last_name", "name"]:
                if isinstance(value, (str, int, float, bool)):
                    contact.custom_fields[f"segment_{key}"] = value
                    updated = True

        if updated:
            contact = contact_repo.update_contact(contact)
            logger.info("Contact updated from Segment", contact_id=contact.id)

        return _json_response(200, {
            "status": "updated",
            "contact_id": contact.id,
        })

    else:
        # Create new contact
        if not email and not phone:
            logger.warning("Cannot create contact without email or phone")
            return _json_response(200, {
                "status": "skipped",
                "reason": "no email or phone",
            })

        custom_fields = {}
        if user_id:
            custom_fields["segment_user_id"] = user_id
        if anonymous_id:
            custom_fields["segment_anonymous_id"] = anonymous_id

        # Store other traits
        for key, value in traits.items():
            if key not in ["email", "phone", "firstName", "first_name",
                          "lastName", "last_name", "name"]:
                if isinstance(value, (str, int, float, bool)):
                    custom_fields[f"segment_{key}"] = value

        contact = Contact(
            workspace_id=workspace_id,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            custom_fields=custom_fields,
            source="segment",
        )

        contact = contact_repo.create_contact(contact)
        logger.info("Contact created from Segment", contact_id=contact.id)

        return _json_response(201, {
            "status": "created",
            "contact_id": contact.id,
        })


def handle_track(workspace_id: str, data: dict) -> dict:
    """Handle Segment track event - trigger workflows.

    Args:
        workspace_id: Workspace ID.
        data: Segment track payload.

    Returns:
        API response.
    """
    user_id = data.get("userId")
    anonymous_id = data.get("anonymousId")
    event_name = data.get("event")
    properties = data.get("properties", {})

    if not event_name:
        return _json_response(400, {"error": "event name required"})

    # Find the contact
    contact = None
    contact_repo = ContactRepository()

    if user_id:
        contact = _find_by_external_id(workspace_id, "segment", user_id)

    if not contact:
        # Try to find by email in properties
        email = properties.get("email")
        if email:
            contact = contact_repo.find_by_email(workspace_id, email)

    if not contact:
        logger.info(
            "No contact found for track event",
            user_id=user_id,
            anonymous_id=anonymous_id,
        )
        return _json_response(200, {
            "status": "skipped",
            "reason": "contact not found",
        })

    # Queue workflow trigger
    _trigger_segment_workflows(
        workspace_id=workspace_id,
        contact_id=contact.id,
        event_type="segment_track",
        event_name=event_name,
        trigger_data={
            "event": event_name,
            "properties": properties,
            "user_id": user_id,
            "anonymous_id": anonymous_id,
            "timestamp": data.get("timestamp"),
            "message_id": data.get("messageId"),
        },
    )

    logger.info(
        "Segment track event queued",
        contact_id=contact.id,
        event=event_name,
    )

    return _json_response(200, {
        "status": "processed",
        "contact_id": contact.id,
        "event": event_name,
    })


def handle_page(workspace_id: str, data: dict) -> dict:
    """Handle Segment page event.

    Args:
        workspace_id: Workspace ID.
        data: Segment page payload.

    Returns:
        API response.
    """
    # Page events are typically high volume - store for analytics
    # but don't trigger workflows by default
    user_id = data.get("userId")
    page_name = data.get("name", "")
    properties = data.get("properties", {})

    logger.debug(
        "Segment page event",
        user_id=user_id,
        page=page_name,
        url=properties.get("url"),
    )

    # Could store in analytics table or forward to another service
    return _json_response(200, {"status": "acknowledged"})


def handle_screen(workspace_id: str, data: dict) -> dict:
    """Handle Segment screen event (mobile).

    Args:
        workspace_id: Workspace ID.
        data: Segment screen payload.

    Returns:
        API response.
    """
    # Similar to page events
    logger.debug(
        "Segment screen event",
        user_id=data.get("userId"),
        screen=data.get("name"),
    )

    return _json_response(200, {"status": "acknowledged"})


def handle_group(workspace_id: str, data: dict) -> dict:
    """Handle Segment group event - associate contact with company/account.

    Args:
        workspace_id: Workspace ID.
        data: Segment group payload.

    Returns:
        API response.
    """
    user_id = data.get("userId")
    group_id = data.get("groupId")
    traits = data.get("traits", {})

    if not user_id or not group_id:
        return _json_response(400, {"error": "userId and groupId required"})

    # Find the contact
    contact = _find_by_external_id(workspace_id, "segment", user_id)
    if not contact:
        return _json_response(200, {
            "status": "skipped",
            "reason": "contact not found",
        })

    # Store group info in custom fields
    contact_repo = ContactRepository()
    contact.custom_fields["segment_group_id"] = group_id

    # Store group traits
    for key, value in traits.items():
        if isinstance(value, (str, int, float, bool)):
            contact.custom_fields[f"segment_group_{key}"] = value

    contact = contact_repo.update_contact(contact)

    logger.info(
        "Contact grouped from Segment",
        contact_id=contact.id,
        group_id=group_id,
    )

    return _json_response(200, {
        "status": "grouped",
        "contact_id": contact.id,
        "group_id": group_id,
    })


def handle_alias(workspace_id: str, data: dict) -> dict:
    """Handle Segment alias event - link identities.

    Args:
        workspace_id: Workspace ID.
        data: Segment alias payload.

    Returns:
        API response.
    """
    previous_id = data.get("previousId")
    user_id = data.get("userId")

    if not previous_id or not user_id:
        return _json_response(400, {"error": "previousId and userId required"})

    # Find contact by previous ID and update to new ID
    contact = _find_by_external_id(workspace_id, "segment", previous_id)
    if not contact:
        return _json_response(200, {
            "status": "skipped",
            "reason": "contact not found",
        })

    contact_repo = ContactRepository()
    contact.custom_fields["segment_user_id"] = user_id
    contact.custom_fields["segment_previous_id"] = previous_id
    contact = contact_repo.update_contact(contact)

    logger.info(
        "Contact aliased from Segment",
        contact_id=contact.id,
        previous_id=previous_id,
        new_id=user_id,
    )

    return _json_response(200, {
        "status": "aliased",
        "contact_id": contact.id,
    })


def _validate_segment_signature(event: dict, body: str, workspace_id: str) -> bool:
    """Validate Segment webhook signature.

    SECURITY: This function fails closed - if validation cannot be performed,
    it returns False to reject the request.

    Segment uses HMAC-SHA1 signature in the x-signature header.

    Args:
        event: API Gateway event.
        body: Request body.
        workspace_id: Workspace ID to get shared secret.

    Returns:
        True if valid, False otherwise.
    """
    shared_secret = os.environ.get("SEGMENT_SHARED_SECRET")
    if not shared_secret:
        # SECURITY: Fail closed when shared secret is not configured
        logger.warning("Segment shared secret not configured, rejecting webhook for security")
        return False

    headers = event.get("headers", {}) or {}
    signature = headers.get("x-signature") or headers.get("X-Signature")

    if not signature:
        logger.warning("No Segment signature header")
        return False

    try:
        # Segment uses HMAC-SHA1
        expected = hmac.new(
            shared_secret.encode("utf-8"),
            body.encode("utf-8"),
            hashlib.sha1,
        ).hexdigest()

        return hmac.compare_digest(signature, expected)

    except Exception as e:
        # SECURITY: Fail closed on any validation error
        logger.error("Signature validation error, rejecting", error=str(e))
        return False


def _find_by_external_id(
    workspace_id: str,
    source: str,
    external_id: str,
) -> Contact | None:
    """Find contact by external ID (e.g., Segment userId).

    Args:
        workspace_id: Workspace ID.
        source: Source system (e.g., "segment").
        external_id: External ID value.

    Returns:
        Contact or None.
    """
    # Query contacts where custom_fields.segment_user_id matches
    # This requires a scan with filter - not ideal for large datasets
    # In production, consider adding a GSI for external IDs
    contact_repo = ContactRepository()

    # For now, do a limited scan with filter
    # TODO: Add GSI for external ID lookups
    contacts, _ = contact_repo.query(
        pk=f"WS#{workspace_id}",
        sk_begins_with="CONTACT#",
        limit=1000,  # Limit scan
    )

    for contact in contacts:
        if contact.custom_fields.get(f"{source}_user_id") == external_id:
            return contact

    return None


def _trigger_segment_workflows(
    workspace_id: str,
    contact_id: str,
    event_type: str,
    event_name: str,
    trigger_data: dict,
) -> None:
    """Queue workflow trigger for Segment event.

    Args:
        workspace_id: Workspace ID.
        contact_id: Contact ID.
        event_type: Type of trigger (e.g., "segment_track").
        event_name: Segment event name.
        trigger_data: Event data.
    """
    queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
    if not queue_url:
        logger.warning("Workflow queue not configured")
        return

    sqs = boto3.client("sqs")

    message = {
        "event_type": event_type,
        "workspace_id": workspace_id,
        "contact_id": contact_id,
        "event_name": event_name,
        "trigger_data": trigger_data,
    }

    # FIFO queue requires MessageGroupId and MessageDeduplicationId
    is_fifo = queue_url.endswith(".fifo")

    params = {
        "QueueUrl": queue_url,
        "MessageBody": json.dumps(message),
    }

    if is_fifo:
        params["MessageGroupId"] = workspace_id
        params["MessageDeduplicationId"] = trigger_data.get(
            "message_id",
            f"{contact_id}-{event_name}-{trigger_data.get('timestamp', '')}",
        )

    sqs.send_message(**params)
    logger.info("Segment workflow trigger queued", event_type=event_type)


def _json_response(status_code: int, body: dict) -> dict:
    """Build JSON API response.

    Args:
        status_code: HTTP status code.
        body: Response body.

    Returns:
        API Gateway response.
    """
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
