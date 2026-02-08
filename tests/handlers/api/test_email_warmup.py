"""Tests for email warm-up API handler."""

import json
import os
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock

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
        "total_delivered": 490,
        "total_opens": 100,
        "total_clicks": 25,
        "total_replies": 10,
        "open_rate": Decimal("20.41"),
        "click_rate": Decimal("5.1"),
        "reply_rate": Decimal("2.04"),
        "send_window_start": 9,
        "send_window_end": 19,
        "low_engagement_warning": False,
        "max_bounce_rate": Decimal("5.0"),
        "max_complaint_rate": Decimal("0.1"),
        "seed_list": ["seed@test.com"],
        "auto_warmup_enabled": False,
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

    @patch("complens.services.email_service.EmailService")
    def test_start_warmup(self, mock_email_cls, dynamodb_table, api_gateway_event):
        """Test starting a warm-up for a domain."""
        from api.email_warmup import handler

        # Mock domain auth check to pass
        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "newdomain.com", "verified": True, "dkim_enabled": True,
            "dkim_status": "Success", "dkim_tokens": [], "ready": True,
        }
        mock_email_cls.return_value = mock_email

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
        assert body["daily_limit"] == 10  # Day 0 of 42-day schedule
        assert body["schedule_length"] == 42
        assert body["send_window_start"] == 9
        assert body["send_window_end"] == 19

    @patch("complens.services.email_service.EmailService")
    def test_start_warmup_custom_schedule(self, mock_email_cls, dynamodb_table, api_gateway_event):
        """Test starting warm-up with custom schedule."""
        from api.email_warmup import handler

        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "custom.com", "verified": True, "dkim_enabled": True,
            "dkim_status": "Success", "dkim_tokens": [], "ready": True,
        }
        mock_email_cls.return_value = mock_email

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup",
            path_params={"workspace_id": WORKSPACE_ID},
            body={
                "domain": "custom.com",
                "schedule": [10, 50, 200],
                "max_bounce_rate": 3.0,
                "send_window_start": 6,
                "send_window_end": 22,
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["domain"] == "custom.com"
        assert body["daily_limit"] == 10
        assert body["schedule_length"] == 3
        assert body["send_window_start"] == 6
        assert body["send_window_end"] == 22

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


class TestCheckDomainAuth:
    """Tests for GET /workspaces/{ws}/email-warmup/check-domain."""

    @patch("api.email_warmup.EmailService")
    def test_check_domain(self, mock_email_cls, dynamodb_table, api_gateway_event):
        """Test checking domain auth status."""
        from api.email_warmup import handler

        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "example.com",
            "verified": True,
            "dkim_enabled": True,
            "dkim_status": "Success",
            "dkim_tokens": ["abc"],
            "ready": True,
        }
        mock_email_cls.return_value = mock_email

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/check-domain",
            path_params={"workspace_id": WORKSPACE_ID},
            query_params={"domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["domain"] == "example.com"
        assert body["verified"] is True
        assert body["dkim_enabled"] is True
        assert body["ready"] is True

    def test_check_domain_missing_param(self, dynamodb_table, api_gateway_event):
        """Test check-domain without domain param."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/check-domain",
            path_params={"workspace_id": WORKSPACE_ID},
        )
        response = handler(event, None)

        assert response["statusCode"] == 400


class TestGetWarmupStatus:
    """Tests for GET /workspaces/{ws}/email-warmup/{domain}."""

    def test_get_status(self, dynamodb_table, api_gateway_event):
        """Test getting warm-up status with engagement fields."""
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
        assert body["total_delivered"] == 490
        assert body["total_opens"] == 100
        assert body["total_clicks"] == 25
        assert body["send_window_start"] == 9
        assert body["send_window_end"] == 19

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


class TestUpdateSeedList:
    """Tests for PUT /workspaces/{ws}/email-warmup/{domain}/seed-list."""

    def test_update_seed_list(self, dynamodb_table, api_gateway_event):
        """Test updating seed list configuration."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table)

        event = api_gateway_event(
            method="PUT",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com/seed-list",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
            body={
                "seed_list": ["a@test.com", "b@test.com"],
                "auto_warmup_enabled": True,
                "from_name": "Test Company",
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["seed_list"] == ["a@test.com", "b@test.com"]
        assert body["auto_warmup_enabled"] is True
        assert body["from_name"] == "Test Company"

    def test_update_seed_list_not_found(self, dynamodb_table, api_gateway_event):
        """Test updating seed list for non-existent domain."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="PUT",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/nonexistent.com/seed-list",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "nonexistent.com"},
            body={
                "seed_list": ["a@test.com"],
                "auto_warmup_enabled": True,
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 404

    def test_update_seed_list_empty_rejected(self, dynamodb_table, api_gateway_event):
        """Test that empty seed list is rejected."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table)

        event = api_gateway_event(
            method="PUT",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com/seed-list",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
            body={
                "seed_list": [],
                "auto_warmup_enabled": True,
            },
        )
        response = handler(event, None)

        assert response["statusCode"] == 400


class TestGetWarmupLog:
    """Tests for GET /workspaces/{ws}/email-warmup/{domain}/warmup-log."""

    def test_warmup_log_empty(self, dynamodb_table, api_gateway_event):
        """Test warmup log when no emails sent."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)
        _seed_warmup(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/example.com/warmup-log",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "example.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["items"] == []

    def test_warmup_log_not_found(self, dynamodb_table, api_gateway_event):
        """Test warmup log for non-existent domain."""
        from api.email_warmup import handler

        _seed_workspace(dynamodb_table)

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/email-warmup/nonexistent.com/warmup-log",
            path_params={"workspace_id": WORKSPACE_ID, "domain": "nonexistent.com"},
        )
        response = handler(event, None)

        assert response["statusCode"] == 404
