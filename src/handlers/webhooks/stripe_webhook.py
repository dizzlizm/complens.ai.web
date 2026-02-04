"""Stripe webhook handler for payment events.

Handles Stripe Connect webhooks and triggers workflows based on payment events.
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.services.stripe_service import (
    StripeError,
    event_to_trigger_data,
    verify_webhook_signature,
)

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Stripe webhook events.

    Args:
        event: API Gateway event.
        context: Lambda context.

    Returns:
        Response dict.
    """
    logger.info("Stripe webhook received")

    # Get signature from headers
    headers = event.get("headers", {}) or {}
    signature = headers.get("Stripe-Signature") or headers.get("stripe-signature")

    if not signature:
        logger.warning("Missing Stripe-Signature header")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing signature"}),
        }

    # SECURITY: Get raw body and decode AFTER signature verification
    # Stripe signature verification requires the raw bytes, not decoded string
    raw_body = event.get("body", "")
    if event.get("isBase64Encoded"):
        import base64
        # Keep as bytes for signature verification
        raw_body = base64.b64decode(raw_body)
    elif isinstance(raw_body, str):
        # Convert string to bytes for verification
        raw_body = raw_body.encode("utf-8")

    # Body string for processing (after verification)
    body = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else raw_body

    # Extract workspace_id from path or query params
    # Webhook URL: /webhooks/stripe/{workspace_id}
    path_params = event.get("pathParameters", {}) or {}
    workspace_id = path_params.get("workspace_id")

    if not workspace_id:
        # Try query params
        query_params = event.get("queryStringParameters", {}) or {}
        workspace_id = query_params.get("workspace_id")

    # SECURITY: Verify signature with raw bytes before processing
    try:
        stripe_event = verify_webhook_signature(raw_body, signature)
    except StripeError as e:
        logger.warning("Webhook signature verification failed", error=e.message)
        return {
            "statusCode": 400,
            "body": json.dumps({"error": e.message}),
        }

    event_type = stripe_event.get("type", "")
    event_data = stripe_event.get("data", {}).get("object", {})

    logger.info(
        "Stripe event received",
        event_type=event_type,
        event_id=stripe_event.get("id"),
        workspace_id=workspace_id,
    )

    # Try to get workspace_id from event metadata if not in URL
    if not workspace_id:
        workspace_id = event_data.get("metadata", {}).get("workspace_id")

    if not workspace_id:
        logger.warning(
            "SECURITY: Rejecting Stripe webhook - no workspace_id in path, "
            "query params, or event metadata",
            event_type=event_type,
            event_id=stripe_event.get("id"),
        )
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "workspace_id required"}),
        }

    # Process based on event type
    try:
        if event_type == "checkout.session.completed":
            _handle_checkout_completed(workspace_id, stripe_event, event_data)

        elif event_type == "payment_intent.succeeded":
            _handle_payment_succeeded(workspace_id, stripe_event, event_data)

        elif event_type == "payment_intent.payment_failed":
            _handle_payment_failed(workspace_id, stripe_event, event_data)

        elif event_type == "customer.subscription.created":
            _handle_subscription_created(workspace_id, stripe_event, event_data)

        elif event_type == "customer.subscription.updated":
            _handle_subscription_updated(workspace_id, stripe_event, event_data)

        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(workspace_id, stripe_event, event_data)

        elif event_type == "invoice.paid":
            _handle_invoice_paid(workspace_id, stripe_event, event_data)

        elif event_type == "invoice.payment_failed":
            _handle_invoice_payment_failed(workspace_id, stripe_event, event_data)

        elif event_type == "charge.refunded":
            _handle_charge_refunded(workspace_id, stripe_event, event_data)

        else:
            logger.debug("Unhandled event type", event_type=event_type)

    except Exception as e:
        logger.exception("Error processing webhook", error=str(e))
        # Still return 200 to prevent retries for processing errors
        return {
            "statusCode": 200,
            "body": json.dumps({"received": True, "processing_error": True}),
        }

    return {
        "statusCode": 200,
        "body": json.dumps({"received": True}),
    }


def _handle_checkout_completed(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle checkout session completed event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    customer_email = event_data.get("customer_email")
    mode = event_data.get("mode")  # payment or subscription

    logger.info(
        "Checkout completed",
        workspace_id=workspace_id,
        customer_email=customer_email,
        mode=mode,
    )

    # Fire workflow trigger
    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_payment_received"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_payment_received",
        trigger_data=trigger_data,
        customer_email=customer_email,
    )


def _handle_payment_succeeded(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle payment intent succeeded event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    amount = event_data.get("amount_received", 0) / 100
    currency = event_data.get("currency", "usd")

    logger.info(
        "Payment succeeded",
        workspace_id=workspace_id,
        amount=amount,
        currency=currency,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_payment_received"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_payment_received",
        trigger_data=trigger_data,
    )


def _handle_payment_failed(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle payment failed event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    logger.info("Payment failed", workspace_id=workspace_id)

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_payment_failed"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_payment_failed",
        trigger_data=trigger_data,
    )


def _handle_subscription_created(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle subscription created event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    subscription_id = event_data.get("id")
    status = event_data.get("status")

    logger.info(
        "Subscription created",
        workspace_id=workspace_id,
        subscription_id=subscription_id,
        status=status,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_subscription_created"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_subscription_created",
        trigger_data=trigger_data,
    )


def _handle_subscription_updated(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle subscription updated event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    subscription_id = event_data.get("id")
    status = event_data.get("status")

    logger.info(
        "Subscription updated",
        workspace_id=workspace_id,
        subscription_id=subscription_id,
        status=status,
    )

    # Check for cancellation at period end
    cancel_at_period_end = event_data.get("cancel_at_period_end", False)

    trigger_type = "trigger_subscription_updated"
    if cancel_at_period_end:
        trigger_type = "trigger_subscription_cancelled"

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = trigger_type

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type=trigger_type,
        trigger_data=trigger_data,
    )


def _handle_subscription_deleted(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle subscription deleted event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    subscription_id = event_data.get("id")

    logger.info(
        "Subscription deleted",
        workspace_id=workspace_id,
        subscription_id=subscription_id,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_subscription_cancelled"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_subscription_cancelled",
        trigger_data=trigger_data,
    )


def _handle_invoice_paid(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle invoice paid event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    invoice_id = event_data.get("id")
    amount_paid = event_data.get("amount_paid", 0) / 100

    logger.info(
        "Invoice paid",
        workspace_id=workspace_id,
        invoice_id=invoice_id,
        amount_paid=amount_paid,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_invoice_paid"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_invoice_paid",
        trigger_data=trigger_data,
    )


def _handle_invoice_payment_failed(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle invoice payment failed event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    invoice_id = event_data.get("id")

    logger.info(
        "Invoice payment failed",
        workspace_id=workspace_id,
        invoice_id=invoice_id,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_payment_failed"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_payment_failed",
        trigger_data=trigger_data,
    )


def _handle_charge_refunded(
    workspace_id: str,
    stripe_event: dict,
    event_data: dict,
) -> None:
    """Handle charge refunded event.

    Args:
        workspace_id: Workspace ID.
        stripe_event: Full Stripe event.
        event_data: Event data object.
    """
    charge_id = event_data.get("id")
    amount_refunded = event_data.get("amount_refunded", 0) / 100

    logger.info(
        "Charge refunded",
        workspace_id=workspace_id,
        charge_id=charge_id,
        amount_refunded=amount_refunded,
    )

    trigger_data = event_to_trigger_data(stripe_event)
    trigger_data["trigger_type"] = "trigger_payment_refunded"

    _fire_workflow_trigger(
        workspace_id=workspace_id,
        trigger_type="trigger_payment_refunded",
        trigger_data=trigger_data,
    )


def _fire_workflow_trigger(
    workspace_id: str,
    trigger_type: str,
    trigger_data: dict,
    customer_email: str | None = None,
) -> None:
    """Fire EventBridge event to trigger workflows.

    Args:
        workspace_id: Workspace ID.
        trigger_type: Workflow trigger type.
        trigger_data: Trigger data.
        customer_email: Optional customer email for contact lookup.
    """
    from datetime import datetime, timezone

    events = boto3.client("events")

    event_detail = {
        "workspace_id": workspace_id,
        "trigger_type": trigger_type,
        **trigger_data,
    }

    if customer_email:
        event_detail["customer_email"] = customer_email

    try:
        events.put_events(
            Entries=[
                {
                    "Source": "complens.stripe",
                    "DetailType": trigger_type,
                    "Detail": json.dumps(event_detail),
                }
            ]
        )

        logger.info(
            "Workflow trigger fired",
            workspace_id=workspace_id,
            trigger_type=trigger_type,
        )
    except Exception as e:
        logger.error("Failed to fire workflow trigger", error=str(e))
