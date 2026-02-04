"""Billing webhook handler for Stripe subscription lifecycle events."""

import json
from typing import Any

import structlog

from complens.repositories.workspace import WorkspaceRepository
from complens.services.billing_service import get_billing_service

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Stripe billing webhook events.

    Routes:
        POST /webhooks/stripe-billing
    """
    try:
        body = event.get("body", "")
        sig_header = (event.get("headers", {}) or {}).get("Stripe-Signature", "")

        if not sig_header:
            logger.warning("Missing Stripe-Signature header")
            return {"statusCode": 400, "body": json.dumps({"error": "Missing signature"})}

        billing = get_billing_service()
        raw_body = body.encode("utf-8") if isinstance(body, str) else body

        try:
            stripe_event = billing.verify_webhook_signature(raw_body, sig_header)
        except Exception as e:
            logger.warning("Webhook signature verification failed", error=str(e))
            return {"statusCode": 400, "body": json.dumps({"error": "Invalid signature"})}

        event_type = stripe_event.get("type", "")
        event_data = stripe_event.get("data", {}).get("object", {})

        logger.info("Billing webhook received", event_type=event_type)

        if event_type == "checkout.session.completed":
            _handle_checkout_completed(event_data)
        elif event_type == "customer.subscription.created":
            _handle_subscription_change(event_data)
        elif event_type == "customer.subscription.updated":
            _handle_subscription_change(event_data)
        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(event_data)
        elif event_type == "invoice.payment_failed":
            _handle_payment_failed(event_data)
        else:
            logger.debug("Unhandled billing event type", event_type=event_type)

    except Exception as e:
        logger.exception("Error processing billing webhook", error=str(e))

    return {"statusCode": 200, "body": json.dumps({"received": True})}


def _handle_checkout_completed(event_data: dict) -> None:
    """Handle checkout session completed - link customer to workspace.

    Args:
        event_data: Stripe checkout session object.
    """
    workspace_id = (event_data.get("metadata") or {}).get("workspace_id")
    customer_id = event_data.get("customer")
    subscription_id = event_data.get("subscription")

    if not workspace_id or not customer_id:
        logger.warning("Checkout completed without workspace_id or customer")
        return

    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        logger.error("Workspace not found for checkout", workspace_id=workspace_id)
        return

    # Update workspace with Stripe customer and subscription info
    workspace.metadata = workspace.metadata or {}
    workspace.metadata["stripe_customer_id"] = customer_id
    workspace.metadata["stripe_subscription_id"] = subscription_id
    workspace.metadata["subscription_status"] = "active"

    ws_repo.update(workspace, check_version=False)

    logger.info(
        "Workspace linked to Stripe customer",
        workspace_id=workspace_id,
        customer_id=customer_id,
    )


def _handle_subscription_change(event_data: dict) -> None:
    """Handle subscription created or updated.

    Args:
        event_data: Stripe subscription object.
    """
    workspace_id = (event_data.get("metadata") or {}).get("workspace_id")
    if not workspace_id:
        logger.debug("Subscription event without workspace_id")
        return

    status = event_data.get("status")
    plan_id = None

    # Extract plan from subscription items
    items = event_data.get("items", {}).get("data", [])
    if items:
        plan_id = items[0].get("price", {}).get("id")

    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return

    # Map price ID to plan name via metadata or env vars
    plan = _resolve_plan_name(plan_id)

    workspace.metadata = workspace.metadata or {}
    workspace.metadata["subscription_status"] = status
    workspace.metadata["stripe_subscription_id"] = event_data.get("id")
    if plan:
        workspace.metadata["plan"] = plan

    ws_repo.update(workspace, check_version=False)

    logger.info(
        "Subscription updated",
        workspace_id=workspace_id,
        status=status,
        plan=plan,
    )


def _handle_subscription_deleted(event_data: dict) -> None:
    """Handle subscription deleted - revert to free plan.

    Args:
        event_data: Stripe subscription object.
    """
    workspace_id = (event_data.get("metadata") or {}).get("workspace_id")
    if not workspace_id:
        return

    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        return

    workspace.metadata = workspace.metadata or {}
    workspace.metadata["plan"] = "free"
    workspace.metadata["subscription_status"] = "canceled"

    ws_repo.update(workspace, check_version=False)

    logger.info("Subscription canceled, reverted to free", workspace_id=workspace_id)


def _handle_payment_failed(event_data: dict) -> None:
    """Handle invoice payment failed.

    Args:
        event_data: Stripe invoice object.
    """
    subscription_id = event_data.get("subscription")
    customer_id = event_data.get("customer")

    logger.warning(
        "Billing payment failed",
        subscription_id=subscription_id,
        customer_id=customer_id,
    )


def _resolve_plan_name(price_id: str | None) -> str | None:
    """Resolve Stripe Price ID to plan name.

    Args:
        price_id: Stripe Price ID.

    Returns:
        Plan name or None.
    """
    import os

    if not price_id:
        return None

    pro_price = os.environ.get("STRIPE_PRO_PRICE_ID", "")
    business_price = os.environ.get("STRIPE_BUSINESS_PRICE_ID", "")

    if price_id == pro_price:
        return "pro"
    elif price_id == business_price:
        return "business"

    return None
