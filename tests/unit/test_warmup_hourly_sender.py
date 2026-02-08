"""Tests for warmup hourly sender Lambda."""

import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"


class TestWarmupHourlySender:
    """Tests for the hourly warmup email sender."""

    def _make_warmup(self, **kwargs):
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        defaults = {
            "workspace_id": "ws-1",
            "domain": "example.com",
            "status": WarmupStatus.ACTIVE,
            "warmup_day": 5,
            "seed_list": ["seed1@test.com", "seed2@test.com"],
            "auto_warmup_enabled": True,
            "send_window_start": 9,
            "send_window_end": 19,
        }
        defaults.update(kwargs)
        return WarmupDomain(**defaults)

    @patch("warmup_hourly_sender.WarmupEmailGenerator")
    @patch("warmup_hourly_sender.EmailService")
    @patch("warmup_hourly_sender.WarmupService")
    @patch("warmup_hourly_sender.WarmupDomainRepository")
    def test_skips_auto_warmup_disabled(self, mock_repo_cls, mock_svc_cls, mock_email_cls, mock_gen_cls):
        """Test that domains with auto_warmup_enabled=False are skipped."""
        from warmup_hourly_sender import handler

        warmup = self._make_warmup(auto_warmup_enabled=False)
        mock_repo = MagicMock()
        mock_repo.list_active.return_value = [warmup]
        mock_repo_cls.return_value = mock_repo

        result = handler({}, None)

        assert result["domains_processed"] == 0
        assert result["total_sent"] == 0

    @patch("warmup_hourly_sender.WarmupEmailGenerator")
    @patch("warmup_hourly_sender.EmailService")
    @patch("warmup_hourly_sender.WarmupService")
    @patch("warmup_hourly_sender.WarmupDomainRepository")
    def test_skips_empty_seed_list(self, mock_repo_cls, mock_svc_cls, mock_email_cls, mock_gen_cls):
        """Test that domains with empty seed list are skipped."""
        from warmup_hourly_sender import handler

        warmup = self._make_warmup(seed_list=[])
        mock_repo = MagicMock()
        mock_repo.list_active.return_value = [warmup]
        mock_repo_cls.return_value = mock_repo

        result = handler({}, None)

        assert result["domains_processed"] == 0

    @patch("warmup_hourly_sender.datetime")
    @patch("warmup_hourly_sender.WarmupEmailGenerator")
    @patch("warmup_hourly_sender.EmailService")
    @patch("warmup_hourly_sender.WarmupService")
    @patch("warmup_hourly_sender.WarmupDomainRepository")
    def test_skips_outside_send_window(self, mock_repo_cls, mock_svc_cls, mock_email_cls, mock_gen_cls, mock_dt):
        """Test that domains outside send window are skipped."""
        from warmup_hourly_sender import handler

        mock_dt.now.return_value = datetime(2026, 1, 15, 3, 0, 0, tzinfo=timezone.utc)
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)

        warmup = self._make_warmup(send_window_start=9, send_window_end=19)
        mock_repo = MagicMock()
        mock_repo.list_active.return_value = [warmup]
        mock_repo_cls.return_value = mock_repo

        mock_svc = MagicMock()
        mock_svc._is_within_send_window.return_value = False
        mock_svc_cls.return_value = mock_svc

        result = handler({}, None)

        assert result["domains_processed"] == 0

    @patch("warmup_hourly_sender.datetime")
    @patch("warmup_hourly_sender.WarmupEmailGenerator")
    @patch("warmup_hourly_sender.EmailService")
    @patch("warmup_hourly_sender.WarmupService")
    @patch("warmup_hourly_sender.WarmupDomainRepository")
    def test_sends_warmup_emails(self, mock_repo_cls, mock_svc_cls, mock_email_cls, mock_gen_cls, mock_dt):
        """Test that warmup emails are generated and sent."""
        from warmup_hourly_sender import handler

        mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)

        warmup = self._make_warmup()
        mock_repo = MagicMock()
        mock_repo.list_active.return_value = [warmup]
        mock_repo.get_daily_counter.return_value = {"send_count": 0}
        mock_repo.get_recent_warmup_emails.return_value = []
        mock_repo_cls.return_value = mock_repo

        mock_svc = MagicMock()
        mock_svc._is_within_send_window.return_value = True
        mock_svc_cls.return_value = mock_svc

        mock_generator = MagicMock()
        mock_generator.generate_email.return_value = {
            "subject": "Test warmup email",
            "body_text": "Hello",
            "body_html": "<p>Hello</p>",
            "content_type": "newsletter",
        }
        mock_gen_cls.return_value = mock_generator

        mock_email = MagicMock()
        mock_email_cls.return_value = mock_email

        result = handler({}, None)

        assert result["domains_processed"] == 1
        assert result["total_sent"] > 0
        mock_email.send_email.assert_called()
        mock_repo.record_warmup_email.assert_called()

    @patch("warmup_hourly_sender.datetime")
    @patch("warmup_hourly_sender.WarmupEmailGenerator")
    @patch("warmup_hourly_sender.EmailService")
    @patch("warmup_hourly_sender.WarmupService")
    @patch("warmup_hourly_sender.WarmupDomainRepository")
    def test_skips_completed_warmup(self, mock_repo_cls, mock_svc_cls, mock_email_cls, mock_gen_cls, mock_dt):
        """Test that completed warmups (daily_limit=-1) are skipped."""
        from warmup_hourly_sender import handler

        mock_dt.now.return_value = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)

        warmup = self._make_warmup(warmup_day=42)  # Past 42-day schedule
        mock_repo = MagicMock()
        mock_repo.list_active.return_value = [warmup]
        mock_repo_cls.return_value = mock_repo

        mock_svc = MagicMock()
        mock_svc._is_within_send_window.return_value = True
        mock_svc_cls.return_value = mock_svc

        result = handler({}, None)

        assert result["total_sent"] == 0


class TestRemainingWindowHours:
    """Tests for _remaining_window_hours helper."""

    def test_normal_window(self):
        from warmup_hourly_sender import _remaining_window_hours

        # At hour 12, window 9-19 -> 7 remaining hours
        assert _remaining_window_hours(12, 9, 19) == 7

    def test_start_of_window(self):
        from warmup_hourly_sender import _remaining_window_hours

        # At hour 9, window 9-19 -> 10 remaining hours
        assert _remaining_window_hours(9, 9, 19) == 10

    def test_end_of_window(self):
        from warmup_hourly_sender import _remaining_window_hours

        # At hour 18, window 9-19 -> 1 remaining hour
        assert _remaining_window_hours(18, 9, 19) == 1

    def test_midnight_wrapping_window(self):
        from warmup_hourly_sender import _remaining_window_hours

        # At hour 23, window 22-6 -> 7 remaining hours
        assert _remaining_window_hours(23, 22, 6) == 7

    def test_minimum_one(self):
        from warmup_hourly_sender import _remaining_window_hours

        # At hour 19 (end of window), should return minimum 1
        assert _remaining_window_hours(19, 9, 19) >= 1
