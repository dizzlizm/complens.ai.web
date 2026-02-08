"""Tests for the billing API handler."""

import json

import pytest


WORKSPACE_ID = "test-workspace-456"
OTHER_WORKSPACE_ID = "other-workspace-999"


def _parse_body(response: dict) -> dict:
    """Parse JSON response body."""
    return json.loads(response["body"])


def _seed_workspace(table, plan="free", stripe_customer_id=None):
    """Seed a workspace record into DynamoDB."""
    item = {
        "PK": "AGENCY#test-agency",
        "SK": "WS#test-workspace-456",
        "GSI1PK": "WS#test-workspace-456",
        "GSI1SK": "META",
        "id": "test-workspace-456",
        "name": "Test Workspace",
        "slug": "test-workspace",
        "agency_id": "test-agency",
        "plan": plan,
        "created_at": "2024-01-01T00:00:00+00:00",
        "updated_at": "2024-01-01T00:00:00+00:00",
        "version": 1,
    }
    if stripe_customer_id:
        item["stripe_customer_id"] = stripe_customer_id
    table.put_item(Item=item)


class TestBilling:
    """Tests for billing API endpoints."""

    # -----------------------------------------------------------------
    # 1. Get billing status — workspace exists
    # -----------------------------------------------------------------
    def test_get_billing_status(self, dynamodb_table, api_gateway_event):
        """GET /workspaces/{ws}/billing returns plan and usage for a seeded workspace."""
        from api.billing import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/billing",
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["plan"] == "free"
        assert body["has_stripe_customer"] is False
        assert "usage" in body

    # -----------------------------------------------------------------
    # 2. Get billing status — no workspace in DB
    # -----------------------------------------------------------------
    def test_get_billing_no_workspace(self, dynamodb_table, api_gateway_event):
        """GET without a workspace in DB returns 404."""
        from api.billing import handler

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/billing",
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 3. Create checkout — missing price_id
    # -----------------------------------------------------------------
    def test_create_checkout_missing_price_id(self, dynamodb_table, api_gateway_event):
        """POST /billing/checkout with empty body returns 400 for missing price_id."""
        from api.billing import handler

        _seed_workspace(dynamodb_table)

        # Pass body as a JSON string with an empty object so the fixture
        # does not convert falsy {} to None.
        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/billing/checkout",
            path_params={"workspace_id": WORKSPACE_ID},
            body='{"not_price_id": "irrelevant"}',
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert "price_id" in body["message"]

    # -----------------------------------------------------------------
    # 4. Create portal — no Stripe customer
    # -----------------------------------------------------------------
    def test_create_portal_no_stripe(self, dynamodb_table, api_gateway_event):
        """POST /billing/portal without stripe_customer_id returns 400."""
        from api.billing import handler

        _seed_workspace(dynamodb_table)  # no stripe_customer_id

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/billing/portal",
            path_params={"workspace_id": WORKSPACE_ID},
            body='{}',
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert "billing account" in body["message"].lower() or "subscribe" in body["message"].lower()

    # -----------------------------------------------------------------
    # 5. Unauthorized workspace — request to workspace not in workspace_ids
    # -----------------------------------------------------------------
    def test_unauthorized_workspace(self, dynamodb_table, api_gateway_event):
        """GET to a workspace not in the caller's workspace_ids returns 403."""
        from api.billing import handler

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{OTHER_WORKSPACE_ID}/billing",
            path_params={"workspace_id": OTHER_WORKSPACE_ID},
            workspace_ids=[WORKSPACE_ID],  # does NOT include OTHER_WORKSPACE_ID
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse_body(response)
        assert body["error_code"] == "FORBIDDEN"
