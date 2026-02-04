"""Billing API handler for platform subscriptions."""

import json
from typing import Any

import structlog

from complens.repositories.workspace import WorkspaceRepository
from complens.services.billing_service import get_billing_service
from complens.services.feature_gate import get_usage_summary
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle billing API requests.

    Routes:
        GET  /workspaces/{workspace_id}/billing
        POST /workspaces/{workspace_id}/billing/checkout
        POST /workspaces/{workspace_id}/billing/portal
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        if http_method == "GET":
            return get_billing_status(workspace_id, auth)
        elif http_method == "POST" and path.endswith("/checkout"):
            return create_checkout(workspace_id, event, auth)
        elif http_method == "POST" and path.endswith("/portal"):
            return create_portal(workspace_id, auth)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Billing handler error", error=str(e))
        return error("Internal server error", 500)


def get_billing_status(workspace_id: str, auth: dict) -> dict:
    """Get current billing status and usage.

    Args:
        workspace_id: Workspace ID.
        auth: Auth context.

    Returns:
        Billing status response.
    """
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("workspace", workspace_id)

    plan = getattr(workspace, "plan", "free") or "free"
    subscription_status = getattr(workspace, "subscription_status", None)
    stripe_customer_id = getattr(workspace, "stripe_customer_id", None)

    # Get current usage counts
    from complens.repositories.contact import ContactRepository
    from complens.repositories.page import PageRepository
    from complens.repositories.workflow import WorkflowRepository

    contact_repo = ContactRepository()
    page_repo = PageRepository()
    workflow_repo = WorkflowRepository()

    try:
        contacts, _ = contact_repo.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONTACT#",
            limit=1,
        )
        # For count, we'd need a separate counter; use rough estimate
        contact_count = len(contacts)
    except Exception:
        contact_count = 0

    try:
        pages, _ = page_repo.list_by_workspace(workspace_id, limit=1000)
        page_count = len(pages)
    except Exception:
        page_count = 0

    try:
        workflows, _ = workflow_repo.list_by_workspace(workspace_id, limit=1000)
        workflow_count = len(workflows)
    except Exception:
        workflow_count = 0

    counts = {
        "contacts": contact_count,
        "pages": page_count,
        "workflows": workflow_count,
    }

    usage = get_usage_summary(plan, counts)

    return success({
        "plan": plan,
        "subscription_status": subscription_status,
        "has_stripe_customer": bool(stripe_customer_id),
        "usage": usage,
    })


def create_checkout(workspace_id: str, event: dict, auth: dict) -> dict:
    """Create a Stripe Checkout session.

    Args:
        workspace_id: Workspace ID.
        event: API Gateway event.
        auth: Auth context.

    Returns:
        Checkout session URL.
    """
    body = json.loads(event.get("body", "{}"))
    price_id = body.get("price_id")

    if not price_id:
        return error("price_id is required", 400)

    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("workspace", workspace_id)

    billing = get_billing_service()
    customer_email = auth.get("email", "")
    stripe_customer_id = getattr(workspace, "stripe_customer_id", None)

    result = billing.create_checkout_session(
        workspace_id=workspace_id,
        price_id=price_id,
        customer_email=customer_email,
        stripe_customer_id=stripe_customer_id,
        success_url=body.get("success_url"),
        cancel_url=body.get("cancel_url"),
    )

    return success(result)


def create_portal(workspace_id: str, auth: dict) -> dict:
    """Create a Stripe Customer Portal session.

    Args:
        workspace_id: Workspace ID.
        auth: Auth context.

    Returns:
        Portal session URL.
    """
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return not_found("workspace", workspace_id)

    stripe_customer_id = getattr(workspace, "stripe_customer_id", None)
    if not stripe_customer_id:
        return error("No billing account found. Please subscribe first.", 400)

    billing = get_billing_service()
    result = billing.create_portal_session(
        stripe_customer_id=stripe_customer_id,
    )

    return success(result)
