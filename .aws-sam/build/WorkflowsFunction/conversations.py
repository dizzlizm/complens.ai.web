"""Conversations API handler."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.conversation import Conversation, CreateConversationRequest
from complens.repositories.conversation import ConversationRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle conversations API requests.

    Routes:
        GET    /workspaces/{workspace_id}/conversations
        GET    /workspaces/{workspace_id}/contacts/{contact_id}/conversations
        POST   /workspaces/{workspace_id}/contacts/{contact_id}/conversations
        GET    /conversations/{conversation_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        contact_id = path_params.get("contact_id")
        conversation_id = path_params.get("conversation_id")

        # Get auth context
        auth = get_auth_context(event)

        repo = ConversationRepository()

        # Route to appropriate handler
        if conversation_id and http_method == "GET":
            # GET /conversations/{conversation_id} - need to check access differently
            return get_conversation(repo, conversation_id, auth)
        elif workspace_id:
            require_workspace_access(auth, workspace_id)

            if contact_id and http_method == "POST":
                return create_conversation(repo, workspace_id, contact_id, event)
            elif contact_id and http_method == "GET":
                return list_by_contact(repo, contact_id, event)
            elif http_method == "GET":
                return list_by_workspace(repo, workspace_id, event)

        return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Conversations handler error", error=str(e))
        return error("Internal server error", 500)


def list_by_workspace(repo: ConversationRepository, workspace_id: str, event: dict) -> dict:
    """List conversations in a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)
    status = query_params.get("status")

    from complens.models.conversation import ConversationStatus

    status_filter = None
    if status:
        try:
            status_filter = ConversationStatus(status)
        except ValueError:
            return error(f"Invalid status: {status}", 400)

    conversations, _ = repo.list_by_workspace(workspace_id, status_filter, limit)

    return success({
        "items": [c.model_dump(mode="json") for c in conversations],
        "pagination": {"limit": limit},
    })


def list_by_contact(repo: ConversationRepository, contact_id: str, event: dict) -> dict:
    """List conversations for a contact."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)

    conversations = repo.list_by_contact(contact_id, limit)

    return success({
        "items": [c.model_dump(mode="json") for c in conversations],
        "pagination": {"limit": limit},
    })


def get_conversation(repo: ConversationRepository, conversation_id: str, auth) -> dict:
    """Get a single conversation.

    SECURITY: This endpoint verifies workspace access by querying the conversation
    first and checking the authenticated user has access to that workspace.
    """
    # Query conversation by ID to get workspace_id
    conversation = repo.get_by_id(conversation_id)

    if not conversation:
        return not_found("Conversation", conversation_id)

    # Verify the authenticated user has access to this conversation's workspace
    try:
        require_workspace_access(auth, conversation.workspace_id)
    except (ForbiddenError, ValueError):
        # Return 403 Forbidden - user doesn't have access to this workspace
        logger.warning(
            "Conversation access denied",
            conversation_id=conversation_id,
            workspace_id=conversation.workspace_id,
            user_id=auth.user_id if auth else None,
        )
        return error("Access denied", 403)

    return success(conversation.model_dump(mode="json"))


def create_conversation(
    repo: ConversationRepository,
    workspace_id: str,
    contact_id: str,
    event: dict,
) -> dict:
    """Create a new conversation."""
    try:
        body = json.loads(event.get("body", "{}"))
        # Override contact_id from path
        body["contact_id"] = contact_id
        request = CreateConversationRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    conversation = Conversation(
        workspace_id=workspace_id,
        contact_id=contact_id,
        channel=request.channel,
        subject=request.subject,
        ai_enabled=request.ai_enabled,
    )

    conversation = repo.create_conversation(conversation)

    logger.info(
        "Conversation created",
        conversation_id=conversation.id,
        workspace_id=workspace_id,
        contact_id=contact_id,
    )

    return created(conversation.model_dump(mode="json"))
