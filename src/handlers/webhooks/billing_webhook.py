"""Billing webhook handler for Stripe subscription lifecycle events via EventBridge."""

import os
from typing import Any

import structlog

from complens.repositories.workspace import WorkspaceRepository

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Stripe billing events from EventBridge.

    EventBridge delivers Stripe events with this structure:
        detail-type: "checkout.session.completed"
        detail: { id, type, data: { object: { ... } } }
    """
    try:
        event_type = event.get("detail-type", "")
        detail = event.get("detail", {})
        event_data = detail.get("data", {}).get("object", {})

        logger.info("Billing event received", event_type=event_type, source=event.get("source"))

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
        logger.exception("Error processing billing event", error=str(e))

    return {"statusCode": 200}


def _handle_checkout_completed(event_data: dict) -> None:
    """Handle checkout session completed — link customer to workspace.

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

    workspace.stripe_customer_id = customer_id
    workspace.stripe_subscription_id = subscription_id
    workspace.subscription_status = "active"

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

    plan = _resolve_plan_name(plan_id)

    workspace.subscription_status = status
    workspace.stripe_subscription_id = event_data.get("id")
    if plan:
        workspace.plan = plan

    # Extract period end for billing display
    period_end = event_data.get("current_period_end")
    if period_end:
        from datetime import datetime, timezone

        workspace.plan_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)

    ws_repo.update(workspace, check_version=False)

    logger.info(
        "Subscription updated",
        workspace_id=workspace_id,
        status=status,
        plan=plan,
    )


def _handle_subscription_deleted(event_data: dict) -> None:
    """Handle subscription deleted — revert to free plan.

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

    workspace.plan = "free"
    workspace.subscription_status = "canceled"

    ws_repo.update(workspace, check_version=False)

    logger.info("Subscription canceled, reverted to free", workspace_id=workspace_id)


def _handle_payment_failed(event_data: dict) -> None:
    """Handle invoice payment failed — mark workspace as past_due.

    Args:
        event_data: Stripe invoice object.
    """
    subscription_id = event_data.get("subscription")
    customer_id = event_data.get("customer")

    # Try to find workspace by subscription metadata
    subscription_data = event_data.get("subscription_details", {}) or {}
    workspace_id = (subscription_data.get("metadata") or {}).get("workspace_id")

    if workspace_id:
        ws_repo = WorkspaceRepository()
        workspace = ws_repo.get_by_id(workspace_id)
        if workspace:
            workspace.subscription_status = "past_due"
            ws_repo.update(workspace, check_version=False)

    logger.warning(
        "Billing payment failed",
        subscription_id=subscription_id,
        customer_id=customer_id,
        workspace_id=workspace_id,
    )


def _resolve_plan_name(price_id: str | None) -> str | None:
    """Resolve Stripe Price ID to plan name.

    Args:
        price_id: Stripe Price ID.

    Returns:
        Plan name or None.
    """
    if not price_id:
        return None

    pro_price = os.environ.get("STRIPE_PRO_PRICE_ID", "")
    business_price = os.environ.get("STRIPE_BUSINESS_PRICE_ID", "")

    if price_id == pro_price:
        return "pro"
    elif price_id == business_price:
        return "business"

    return None
