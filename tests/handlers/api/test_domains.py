"""Tests for the domains API handler."""

import json

import pytest


WORKSPACE_ID = "test-workspace-456"
OTHER_WORKSPACE_ID = "other-workspace-999"


def _parse_body(response: dict) -> dict:
    """Parse JSON response body."""
    return json.loads(response["body"])


class TestDomains:
    """Tests for domain management API endpoints."""

    # -----------------------------------------------------------------
    # 1. List domains — empty workspace
    # -----------------------------------------------------------------
    def test_list_domains_empty(self, dynamodb_table, api_gateway_event):
        """GET /workspaces/{ws}/domains returns empty items when none exist."""
        from api.domains import handler

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/domains",
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["items"] == []
        assert body["used"] == 0

    # -----------------------------------------------------------------
    # 2. Create domain — requires pro plan (free plan gets 403)
    # -----------------------------------------------------------------
    def test_create_domain_requires_pro_plan(self, dynamodb_table, api_gateway_event):
        """POST on free plan returns 403 because custom_domain feature is gated."""
        from api.domains import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/domains",
            path_params={"workspace_id": WORKSPACE_ID},
            body={
                "page_id": "test-page-123",
                "domain": "example.com",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse_body(response)
        assert body["error_code"] == "PLAN_LIMIT_REACHED"
        assert "custom_domain" in body["message"]

    # -----------------------------------------------------------------
    # 3. Unauthorized workspace — POST to workspace not in workspace_ids
    # -----------------------------------------------------------------
    def test_unauthorized_workspace(self, dynamodb_table, api_gateway_event):
        """POST to a workspace not in the caller's workspace_ids returns 403."""
        from api.domains import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{OTHER_WORKSPACE_ID}/domains",
            path_params={"workspace_id": OTHER_WORKSPACE_ID},
            body={
                "page_id": "test-page-123",
                "domain": "example.com",
            },
            workspace_ids=[WORKSPACE_ID],  # does NOT include OTHER_WORKSPACE_ID
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse_body(response)
        assert body["error_code"] == "FORBIDDEN"
