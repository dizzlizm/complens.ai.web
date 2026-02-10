"""Tests for WarmupService."""

import os
import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, PropertyMock

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
            warmup_day=0,  # limit = 10
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_hourly_send.return_value = 1  # Under hourly limit
        repo.increment_daily_send.return_value = 5  # Under 10

        service = self._make_service(repo)

        # Mock time to be within default send window (9-19 UTC)
        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False
        assert result.remaining == 5
        assert result.daily_limit == 10

    def test_over_daily_limit(self):
        """Test that emails over the daily limit are deferred."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,  # limit = 10
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_hourly_send.return_value = 1  # Under hourly limit
        repo.increment_daily_send.return_value = 11  # Over 10

        service = self._make_service(repo)

        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
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
            warmup_day=42,  # Past 42-day schedule
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_outside_send_window_defers(self):
        """Test that emails outside the send window are deferred."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,
            send_window_start=9,
            send_window_end=19,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup

        service = self._make_service(repo)

        # Mock time to 3am UTC (outside 9-19 window)
        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 3, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is False
        assert result.should_defer is True

    def test_over_hourly_limit_defers(self):
        """Test that emails over the hourly limit are deferred."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=7,  # limit = 65, window = 10h, hourly = ceil(65/10) = 7
            send_window_start=9,
            send_window_end=19,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_hourly_send.return_value = 8  # Over hourly limit of 7

        service = self._make_service(repo)

        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is False
        assert result.should_defer is True

    def test_fail_open_on_repo_error(self):
        """Test that DynamoDB errors fail open (allow sending)."""
        repo = MagicMock()
        repo.get_by_domain.side_effect = Exception("DynamoDB error")

        service = self._make_service(repo)
        result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_fail_open_on_counter_error(self):
        """Test that daily counter increment errors fail open."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_hourly_send.return_value = 1  # Under hourly limit
        repo.increment_daily_send.side_effect = Exception("Counter error")

        service = self._make_service(repo)

        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            result = service.check_warmup_limit("sender@example.com")

        assert result.allowed is True
        assert result.should_defer is False

    def test_fail_open_on_hourly_counter_error(self):
        """Test that hourly counter increment errors fail open."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=0,
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.increment_hourly_send.side_effect = Exception("Hourly counter error")

        service = self._make_service(repo)

        with patch("complens.services.warmup_service.datetime") as mock_dt:
            mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
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

    def test_start_warmup_with_seed_list(self):
        """Test starting warm-up with seed list and auto-warmup."""
        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        result = service.start_warmup(
            "ws-1", "example.com",
            seed_list=["a@test.com", "b@test.com"],
            auto_warmup_enabled=True,
            from_name="Test Corp",
        )

        assert result.seed_list == ["a@test.com", "b@test.com"]
        assert result.auto_warmup_enabled is True
        assert result.from_name == "Test Corp"

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

    def test_advance_day_with_engagement(self):
        """Test that advance_day rolls up engagement metrics."""
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
            "delivery_count": 145,
            "open_count": 40,
        }
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.advance_day("example.com")

        assert result.total_delivered == 145
        assert result.total_opens == 40
        assert result.open_rate > 0

    def test_advance_day_completes(self):
        """Test warm-up completion when past schedule."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=41,  # Last day of 42-day schedule
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = None
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.advance_day("example.com")

        assert result.warmup_day == 42
        assert result.status == "completed"

    def test_advance_day_low_engagement_warning(self):
        """Test that low engagement triggers warning after day 7."""
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
            warmup_day=8,
            total_delivered=200,
            total_opens=5,  # 2.5% open rate < 5%
        )
        repo = MagicMock()
        repo.get_by_domain.return_value = warmup
        repo.get_daily_counter.return_value = {
            "send_count": 100,
            "bounce_count": 0,
            "complaint_count": 0,
            "delivery_count": 95,
            "open_count": 2,
        }
        repo.update_warmup.side_effect = lambda w: w

        service = self._make_service(repo)
        result = service.advance_day("example.com")

        # total_delivered = 200 + 95 = 295, total_opens = 5 + 2 = 7
        # open_rate = (7 / 295) * 100 ~= 2.37% < 5%
        assert result.low_engagement_warning is True

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


class TestWarmupServiceEngagement:
    """Tests for engagement recording methods."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    def test_record_delivery(self):
        """Test recording a delivery event."""
        repo = MagicMock()
        service = self._make_service(repo)

        service.record_delivery("example.com")

        repo.increment_daily_delivery.assert_called_once()

    def test_record_open(self):
        """Test recording an open event."""
        repo = MagicMock()
        service = self._make_service(repo)

        service.record_open("example.com")

        repo.increment_daily_open.assert_called_once()

    def test_record_delivery_error_swallowed(self):
        """Test that delivery recording errors don't propagate."""
        repo = MagicMock()
        repo.increment_daily_delivery.side_effect = Exception("DB error")
        service = self._make_service(repo)

        # Should not raise
        service.record_delivery("example.com")



class TestWarmupServiceStartWithAuth:
    """Tests for start_warmup with domain auth check."""

    def _make_service(self, repo=None):
        from complens.services.warmup_service import WarmupService
        return WarmupService(repo=repo or MagicMock(), deferred_queue_url="https://sqs/test")

    @patch("complens.services.email_service.EmailService")
    def test_start_rejects_unverified_domain(self, mock_email_cls):
        """Test that starting warmup rejects unverified domain."""
        from complens.utils.exceptions import ValidationError

        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "bad.com",
            "verified": False,
            "dkim_enabled": False,
            "dkim_status": None,
            "dkim_tokens": [],
            "ready": False,
        }
        mock_email_cls.return_value = mock_email

        repo = MagicMock()
        service = self._make_service(repo)

        with pytest.raises(ValidationError):
            service.start_warmup("ws-1", "bad.com")

    @patch("complens.services.email_service.EmailService")
    def test_start_allows_verified_domain(self, mock_email_cls):
        """Test that starting warmup allows verified domain."""
        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "good.com",
            "verified": True,
            "dkim_enabled": True,
            "dkim_status": "Success",
            "dkim_tokens": ["abc"],
            "ready": True,
        }
        mock_email_cls.return_value = mock_email

        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        result = service.start_warmup("ws-1", "good.com")

        assert result.domain == "good.com"
        assert result.status == "active"

    @patch("complens.services.email_service.EmailService")
    def test_start_passes_send_window(self, mock_email_cls):
        """Test that start_warmup stores send window params."""
        mock_email = MagicMock()
        mock_email.check_domain_auth.return_value = {
            "domain": "good.com", "verified": True, "dkim_enabled": True,
            "dkim_status": "Success", "dkim_tokens": [], "ready": True,
        }
        mock_email_cls.return_value = mock_email

        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        result = service.start_warmup("ws-1", "good.com", send_window_start=6, send_window_end=22)

        assert result.send_window_start == 6
        assert result.send_window_end == 22

    @patch("complens.services.email_service.EmailService")
    def test_start_fails_open_on_auth_check_error(self, mock_email_cls):
        """Test that auth check errors don't block warmup start."""
        mock_email = MagicMock()
        mock_email.check_domain_auth.side_effect = Exception("SES unavailable")
        mock_email_cls.return_value = mock_email

        repo = MagicMock()
        repo.create_warmup.side_effect = lambda w: w
        service = self._make_service(repo)

        # Should not raise - fails open
        result = service.start_warmup("ws-1", "flaky.com")
        assert result.domain == "flaky.com"
        assert result.status == "active"


class TestSendWindowHelpers:
    """Tests for send window helper methods."""

    def test_within_normal_window(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._is_within_send_window(12, 9, 19) is True
        assert WarmupService._is_within_send_window(9, 9, 19) is True
        assert WarmupService._is_within_send_window(18, 9, 19) is True

    def test_outside_normal_window(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._is_within_send_window(19, 9, 19) is False
        assert WarmupService._is_within_send_window(3, 9, 19) is False
        assert WarmupService._is_within_send_window(8, 9, 19) is False

    def test_midnight_wrapping_window(self):
        from complens.services.warmup_service import WarmupService
        # Window 22:00 - 06:00
        assert WarmupService._is_within_send_window(23, 22, 6) is True
        assert WarmupService._is_within_send_window(0, 22, 6) is True
        assert WarmupService._is_within_send_window(5, 22, 6) is True
        assert WarmupService._is_within_send_window(6, 22, 6) is False
        assert WarmupService._is_within_send_window(12, 22, 6) is False

    def test_window_hours(self):
        from complens.services.warmup_service import WarmupService
        assert WarmupService._get_window_hours(9, 19) == 10
        assert WarmupService._get_window_hours(22, 6) == 8
        assert WarmupService._get_window_hours(0, 24) == 24
        assert WarmupService._get_window_hours(0, 0) == 1  # Minimum 1


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
