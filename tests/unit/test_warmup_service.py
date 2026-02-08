"""Tests for WarmupService."""

import os
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"


class TestWarmupServiceCheckLimit:
    """Tests for the hot-path check_warmup_limit method."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    def test_no_warmup_record(self):
        """Test that emails pass through when no warmup record exists."""
        repo = MagicMock()
        repo.get_by_domain.return_value = None
        service = self._make_service(repo)

        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_inactive_warmup(self):
        """Test that paused/completed warmups don't block emails."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.PAUSED,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        service = self._make_service(repo)

        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_under_daily_limit(self):
        """Test that emails under the daily limit are allowed."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,  # limit = 50
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_daily_send.return_value = 25  # Under 50

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False
        assert result.remaining == 25
        assert result.daily_limit == 50

    def test_over_daily_limit(self):
        """Test that emails over the daily limit are deferred."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,  # limit = 50
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_daily_send.return_value = 51  # Over 50

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is False
        assert result.should_defer is True
        assert result.remaining == 0

    def test_completed_warmup_no_limit(self):
        """Test that completed warmups (past schedule) have no limit."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=14,  # Past 14-day schedule
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_fail_open_on_repo_error(self):
        """Test that DynamoDB errors fail open (allow sending)."""
        repo = MagicMock()
        repo.get_by_domain.side_effect = Exception("DynamoDB error")

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_fail_open_on_counter_error(self):
        """Test that counter increment errors fail open."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_daily_send.side_effect = Exception("Counter error")

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_invalid_email_passes_through(self):
        """Test that emails without @ pass through."""
        service = self._make_service()
        result = service.check_warmup_limit("not-an-email")

        assert result.allowed is True
        assert result.should_defer is False


class TestWarmupServiceLifecycle:
    """Tests for warm-up lifecycle management."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    def test_start_warmup(self):
        """Test starting a new warm-up."""
        from complens.models.warmup_domain import WarmupDomain

        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        result = service.start_warmup("ws-1", "example.com")

        assert result.domain == "example.com"
        assert result.workspace_id == "ws-1"
        assert result.status == "active"
        assert result.warmup_day == 0
        assert result.started_at is not None
        repo.create_warmup.assert_called_once()

    def test_start_warmup_custom_schedule(self):
        """Test starting warm-up with custom schedule."""
        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        result = service.start_warmup("ws-1", "example.com", schedule=[10, 50, 100])

        assert result.schedule == [10, 50, 100]
        assert result.daily_limit == 10

    def test_pause_warmup(self):
        """Test pausing a warm-up."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.pause_warmup("example.com", reason="testing")

        assert result.status == "paused"
        assert result.pause_reason == "testing"

    def test_pause_warmup_not_found(self):
        """Test pausing a non-existent warm-up raises NotFoundError."""
        from complens.utils.exceptions import NotFoundError

        repo = MagicMock()
        repo.get_by_domain.return_value = None
        service = self._make_service(repo)

        with pytest.raises(NotFoundError):
            service.pause_warmup("nonexistent.com")

    def test_resume_warmup(self):
        """Test resuming a paused warm-up."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.PAUSED,
            pause_reason="manual",
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.resume_warmup("example.com")

        assert result.status == "active"
        assert result.pause_reason is None

    def test_resume_non_paused_fails(self):
        """Test resuming a non-paused warm-up raises ValidationError."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus
        from complens.utils.exceptions import ValidationError

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        service = self._make_service(repo)

        with pytest.raises(ValidationError):
            service.resume_warmup("example.com")

    def test_cancel_warmup(self):
        """Test cancelling a warm-up."""
        repo = MagicMock()
        repo.delete_warmup.return_value = True
        service = self._make_service(repo)

        result = service.cancel_warmup("example.com")

        assert result is True
        repo.delete_warmup.assert_called_once_with("example.com")


class TestWarmupServiceAdvanceDay:
    """Tests for daily warm-up advancement."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    def test_advance_day(self):
        """Test advancing warm-up day."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=2,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = {
            "send_count": 150,
            "bounce_count": 1,
            "complaint_count": 0,
        }
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.advance_day("example.com")

        assert result.warmup_day == 3
        assert result.total_sent == 150
        assert result.total_bounced == 1
        assert result.status == "active"

    def test_advance_day_completes(self):
        """Test warm-up completion when past schedule."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=13,  # Last day of 14-day schedule
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = None
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.advance_day("example.com")

        assert result.warmup_day == 14
        assert result.status == "completed"

    def test_advance_day_not_active(self):
        """Test advance_day skips non-active warmups."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.PAUSED,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        service = self._make_service(repo)

        result = service.advance_day("example.com")

        assert result is None
        repo.update_warmup.assert_not_called()


class TestWarmupServiceReputation:
    """Tests for bounce/complaint tracking and auto-pause."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    def test_record_bounce_auto_pause(self):
        """Test that exceeding bounce threshold auto-pauses."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            max_bounce_rate=5.0,
        )
        repo = MagicMock()
        repo.increment_daily_bounce.return_value = 10
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = {
            "send_count": 100,
            "bounce_count": 10,  # 10% > 5%
            "complaint_count": 0,
        }
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        auto_paused = service.record_bounce("example.com")

        assert auto_paused is True
        # Verify pause was called
        assert warmup.status == "paused"

    def test_record_bounce_below_threshold(self):
        """Test that bounces below threshold don't pause."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            max_bounce_rate=5.0,
        )
        repo = MagicMock()
        repo.increment_daily_bounce.return_value = 1
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = {
            "send_count": 100,
            "bounce_count": 1,  # 1% < 5%
            "complaint_count": 0,
        }

        service = self._make_service(repo)
        auto_paused = service.record_bounce("example.com")

        assert auto_paused is False

    def test_small_sample_size_no_pause(self):
        """Test that small sample sizes don't trigger auto-pause."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            max_bounce_rate=5.0,
        )
        repo = MagicMock()
        repo.increment_daily_bounce.return_value = 3
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = {
            "send_count": 5,  # Under min sample of 10
            "bounce_count": 3,
            "complaint_count": 0,
        }

        service = self._make_service(repo)
        auto_paused = service.record_bounce("example.com")

        assert auto_paused is False


class TestWarmupServiceDeferEmail:
    """Tests for email deferral to SQS."""

    def test_defer_email_success(self):
        """Test successful email deferral."""
        from complens.services.warmup_service import WarmupService

        sqs_mock = MagicMock()
        sqs_mock.send_message.return_value = {"MessageId": "msg-123"}

        service = WarmupService(
            repo=MagicMock(),
            deferred_queue_url="https://sqs/test",
        )
        service._sqs = sqs_mock

        result = service.defer_email(
            to=["user@example.com"],
            subject="Test",
            body_text="Hello",
            body_html=None,
            from_email="sender@example.com",
            reply_to=None,
            cc=None,
            bcc=None,
            tags=None,
            domain="example.com",
        )

        assert result["status"] == "deferred"
        assert result["message_id"] == "msg-123"
        sqs_mock.send_message.assert_called_once()

    @patch.dict(os.environ, {"DEFERRED_EMAIL_QUEUE_URL": ""})
    def test_defer_email_no_queue(self):
        """Test deferral when no queue URL is configured."""
        from complens.services.warmup_service import WarmupService

        service = WarmupService(repo=MagicMock())
        # Explicitly ensure no queue URL
        service._deferred_queue_url = None

        result = service.defer_email(
            to=["user@example.com"],
            subject="Test",
            body_text="Hello",
            body_html=None,
            from_email="sender@example.com",
            reply_to=None,
            cc=None,
            bcc=None,
            tags=None,
            domain="example.com",
        )

        assert result["status"] == "send_failed"
        assert result["reason"] == "no_queue_configured"


class TestExtractDomain:
    """Tests for domain extraction helper."""

    def test_valid_email(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._extract_domain("user@example.com") == "example.com"

    def test_subdomain_email(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._extract_domain("user@mail.example.com") == "mail.example.com"

    def test_uppercase_normalized(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._extract_domain("user@EXAMPLE.COM") == "example.com"

    def test_no_at_sign(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._extract_domain("not-an-email") is None

    def test_calc_rate(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._calc_rate(5, 100) == 5.0
        assert WarmupService._calc_rate(0, 100) == 0.0
        assert WarmupService._calc_rate(5, 0) == 0.0
