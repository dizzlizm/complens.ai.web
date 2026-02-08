"""Tests for email warm-up API handler."""

import json
import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"
os.environ["DEFERRED_EMAIL_QUEUE_URL"] = "https://sqs/test"

WORKSPACE_ID = "test-workspace-456"


def _seed_workspace(table, plan="pro"):
    """Seed a workspace for feature gate checks."""
    table.put_item(Item={
        "PK": "AGENCY#test-agency",
        "SK": f"WS#{WORKSPACE_ID}",
        "GSI1PK": f"WS#{WORKSPACE_ID}",
        "GSI1SK": "META",
        "id": WORKSPACE_ID,
        "agency_id": "test-agency",
        "name": "Test Workspace",
        "slug": "test-workspace",
        "plan": plan,
        "version": 1,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    })


def _seed_warmup(table, domain="example.com", status="active", warmup_day=3):
    """Seed a warmup domain record."""
    from complens.models.warmup_domain import DEFAULT_WARMUP_SCHEDULE

    table.put_item(Item={
        "PK": f"WARMUP#{domain}",
        "SK": "META",
        "GSI1PK": f"WS#{WORKSPACE_ID}#WARMUPS",
        "GSI1SK": f"{status}#{domain}",
        "id": "warmup-123",
        "workspace_id": WORKSPACE_ID,
        "domain": domain,
        "status": status,
        "warmup_day": warmup_day,
        "schedule": DEFAULT_WARMUP_SCHEDULE,
        "total_sent": 500,
        "total_bounced": 2,
        "total_complaints": 0,
        "bounce_rate": Decimal("0.4"),
        "complaint_rate": Decimal("0.0"),
        "max_bounce_rate": Decimal("5.0"),
        "max_complaint_rate": Decimal("0.1"),
        "version": 1,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    })


def _parse_body(response):
    """Parse JSON body from API response."""
    return json.loads(response["body"])


class TestListWarmups:
    """Tests for GET /workspaces/{ws}/email-warmup."""

    def test_list_warmups_empty(self, dynamodb_table, api_gateway_event):
        """Test listing warmups when none exist."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["items"] == []

    def test_list_warmups_with_data(self, dynamodb_table, api_gateway_event):
        """Test listing warmups with existing records."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table, domain="example.com", status="active")

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert len(body["items"]) == 1
        assert body["items"][0]["domain"] == "example.com"
        assert body["items"][0]["status"] == "active"


class TestStartWarmup:
    """Tests for POST /workspaces/{ws}/email-warmup."""

    def test_start_warmup(self, dynamodb_table, api_gateway_event):
        """Test starting a warm-up for a domain."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
            body={"domain": "newdomain.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["domain"] == "newdomain.com"
        assert body["status"] == "active"
        assert body["warmup_day"] == 0
        assert body["daily_limit"] == 50

    def test_start_warmup_custom_schedule(self, dynamodb_table, api_gateway_event):
        """Test starting warm-up with custom schedule."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
            body={
                "domain": "custom.com",
                "schedule": [10, 50, 200],
                "max_bounce_rate": 3.0,
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["domain"] == "custom.com"
        assert body["daily_limit"] == 10
        assert body["schedule_length"] == 3

    def test_start_warmup_free_plan_blocked(self, dynamodb_table, api_gateway_event):
        """Test that free plan users can't start warm-up."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table, plan="free")

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
            body={"domain": "blocked.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 403


class TestGetWarmupStatus:
    """Tests for GET /workspaces/{ws}/email-warmup/{domain}."""

    def test_get_status(self, dynamodb_table, api_gateway_event):
        """Test getting warm-up status."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["domain"] == "example.com"
        assert body["status"] == "active"
        assert body["warmup_day"] == 3
        assert body["total_sent"] == 500

    def test_get_status_not_found(self, dynamodb_table, api_gateway_event):
        """Test getting status for non-existent domain."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/nonexistent.com",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "nonexistent.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 404


class TestPauseResumeWarmup:
    """Tests for pause and resume endpoints."""

    def test_pause_warmup(self, dynamodb_table, api_gateway_event):
        """Test pausing a warm-up."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table, status="active")

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com/pause",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["status"] == "paused"
        assert body["pause_reason"] == "manual"

    def test_resume_warmup(self, dynamodb_table, api_gateway_event):
        """Test resuming a paused warm-up."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table, status="paused")

        # Need to also set pause_reason
        dynamodb_table.update_item(
            Key={"PK": "WARMUP#example.com", "SK": "META"},
            UpdateExpression="SET pause_reason = :r",
            ExpressionAttributeValues={":r": "manual"},
        )

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com/resume",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["status"] == "active"


class TestCancelWarmup:
    """Tests for DELETE /workspaces/{ws}/email-warmup/{domain}."""

    def test_cancel_warmup(self, dynamodb_table, api_gateway_event):
        """Test cancelling a warm-up."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table)

        event = api_gateway_event(
            method="DELETE",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["deleted"] is True

    def test_cancel_nonexistent(self, dynamodb_table, api_gateway_event):
        """Test cancelling a non-existent warm-up."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="DELETE",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/nonexistent.com",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "nonexistent.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 404
