"""Billing service for Stripe platform subscriptions."""

import os
from typing import Any

import structlog

logger = structlog.get_logger()

# Pricing tier limits
PLAN_LIMITS = {
    "free": {
        "contacts": 100,
        "pages": 1,
        "workflows": 3,
        "runs_per_month": 100,
        "team_members": 1,
        "custom_domain": False,
        "knowledge_base": False,
    },
    "pro": {
        "contacts": 10000,
        "pages": 25,
        "workflows": 50,
        "runs_per_month": 10000,
        "team_members": 5,
        "custom_domain": True,
        "knowledge_base": True,
    },
    "business": {
        "contacts": -1,  # unlimited
        "pages": -1,
        "workflows": -1,
        "runs_per_month": -1,
        "team_members": -1,
        "custom_domain": True,
        "knowledge_base": True,
    },
}


class BillingService:
    """Service for managing Stripe platform billing."""

    def __init__(self) -> None:
        """Initialize billing service with lazy Stripe import."""
        self._stripe = None

    @property
    def stripe(self):
        """Get Stripe module (lazy import)."""
        if self._stripe is None:
            import stripe
            stripe.api_key = os.environ.get("STRIPE_BILLING_SECRET_KEY", "")
            self._stripe = stripe
        return self._stripe

    def resolve_price_id(self, plan_or_price_id: str) -> str:
        """Resolve a plan name to its Stripe Price ID.

        Args:
            plan_or_price_id: Either a plan name ('pro', 'business') or actual Price ID.

        Returns:
            Stripe Price ID.

        Raises:
            ValueError: If plan name is invalid and no Price ID env var is set.
        """
        # If it looks like a Stripe price ID, return as-is
        if plan_or_price_id.startswith("price_"):
            return plan_or_price_id

        # Resolve plan name to Price ID from environment
        plan_to_env = {
            "pro": "STRIPE_PRO_PRICE_ID",
            "business": "STRIPE_BUSINESS_PRICE_ID",
        }

        env_var = plan_to_env.get(plan_or_price_id.lower())
        if not env_var:
            raise ValueError(f"Invalid plan: {plan_or_price_id}")

        price_id = os.environ.get(env_var)
        if not price_id:
            raise ValueError(f"Stripe price not configured for plan: {plan_or_price_id}")

        return price_id

    def create_checkout_session(
        self,
        workspace_id: str,
        price_id: str,
        customer_email: str,
        stripe_customer_id: str | None = None,
        success_url: str | None = None,
        cancel_url: str | None = None,
    ) -> dict[str, str]:
        """Create a Stripe Checkout session for subscription.

        Args:
            workspace_id: Workspace ID.
            price_id: Stripe Price ID for the plan.
            customer_email: Customer email.
            stripe_customer_id: Existing Stripe customer ID.
            success_url: URL to redirect on success.
            cancel_url: URL to redirect on cancel.

        Returns:
            Dict with session_id and url.
        """
        stage = os.environ.get("STAGE", "dev")
        base_url = f"https://{'complens.ai' if stage == 'prod' else f'{stage}.complens.ai'}"

        # Resolve plan name to actual Stripe Price ID if needed
        resolved_price_id = self.resolve_price_id(price_id)

        params: dict[str, Any] = {
            "mode": "subscription",
            "line_items": [{"price": resolved_price_id, "quantity": 1}],
            "success_url": success_url or f"{base_url}/settings?billing=success",
            "cancel_url": cancel_url or f"{base_url}/settings?billing=cancel",
            "metadata": {"workspace_id": workspace_id},
            "subscription_data": {"metadata": {"workspace_id": workspace_id}},
        }

        if stripe_customer_id:
            params["customer"] = stripe_customer_id
        else:
            params["customer_email"] = customer_email

        session = self.stripe.checkout.Session.create(**params)

        logger.info(
            "Checkout session created",
            workspace_id=workspace_id,
            session_id=session.id,
        )

        return {"session_id": session.id, "url": session.url}

    def create_portal_session(
        self,
        stripe_customer_id: str,
        return_url: str | None = None,
    ) -> dict[str, str]:
        """Create a Stripe Customer Portal session.

        Args:
            stripe_customer_id: Stripe customer ID.
            return_url: URL to return to after portal.

        Returns:
            Dict with url.
        """
        stage = os.environ.get("STAGE", "dev")
        base_url = f"https://{'complens.ai' if stage == 'prod' else f'{stage}.complens.ai'}"

        session = self.stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=return_url or f"{base_url}/settings",
        )

        return {"url": session.url}

    @staticmethod
    def get_plan_limits(plan: str) -> dict:
        """Get resource limits for a plan.

        Args:
            plan: Plan name (free, pro, business).

        Returns:
            Plan limits dict.
        """
        return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])


def get_billing_service() -> BillingService:
    """Get billing service instance.

    Returns:
        BillingService instance.
    """
    return BillingService()
