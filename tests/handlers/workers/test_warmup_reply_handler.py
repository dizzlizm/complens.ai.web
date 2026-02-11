"""Tests for warmup reply handler Lambda."""

import os
from unittest.mock import MagicMock, patch

import pytest

os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"


class TestWarmupReplyHandler:
    """Tests for SES inbound reply tracking."""

    def _make_ses_event(self, recipients=None, sender="replier@external.com"):
        """Create a mock SES Receipt Rule event."""
        return {
            "Records": [
                {
                    "ses": {
                        "mail": {
                            "source": sender,
                            "messageId": "msg-123",
                        },
                        "receipt": {
                            "recipients": recipients or ["warmup@example.com"],
                        },
                    },
                },
            ],
        }

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_reply_recorded_for_active_warmup(self, mock_repo_cls, mock_svc_cls):
        """Test that replies to active warmup domains are recorded."""
        from warmup_reply_handler import handler
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )

        mock_svc = MagicMock()
        mock_svc.get_status.return_value = warmup
        mock_svc_cls.return_value = mock_svc

        event = self._make_ses_event(recipients=["warmup@example.com"])
        result = handler(event, None)

        assert result["replies_recorded"] == 1

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_non_warmup_domain_ignored(self, mock_repo_cls, mock_svc_cls):
        """Test that replies to non-warmup domains are ignored."""
        from warmup_reply_handler import handler

        mock_svc = MagicMock()
        mock_svc.get_status.return_value = None
        mock_svc_cls.return_value = mock_svc

        event = self._make_ses_event(recipients=["user@random.com"])
        result = handler(event, None)

        assert result["replies_recorded"] == 0

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_inactive_warmup_ignored(self, mock_repo_cls, mock_svc_cls):
        """Test that replies to paused warmup domains are ignored."""
        from warmup_reply_handler import handler
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.PAUSED,
        )

        mock_svc = MagicMock()
        mock_svc.get_status.return_value = warmup
        mock_svc_cls.return_value = mock_svc

        event = self._make_ses_event(recipients=["warmup@example.com"])
        result = handler(event, None)

        assert result["replies_recorded"] == 0

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_multiple_recipients(self, mock_repo_cls, mock_svc_cls):
        """Test handling multiple recipients in one event."""
        from warmup_reply_handler import handler
        from complens.models.warmup_domain import WarmupDomain, WarmupStatus

        warmup1 = WarmupDomain(
            workspace_id="ws-1",
            domain="example.com",
            status=WarmupStatus.ACTIVE,
        )

        mock_svc = MagicMock()
        mock_svc.get_status.side_effect = lambda d: warmup1 if d == "example.com" else None
        mock_svc_cls.return_value = mock_svc

        event = self._make_ses_event(
            recipients=["warmup@example.com", "user@other.com"],
        )
        result = handler(event, None)

        assert result["replies_recorded"] == 1

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_empty_records(self, mock_repo_cls, mock_svc_cls):
        """Test handling empty event."""
        from warmup_reply_handler import handler

        result = handler({"Records": []}, None)

        assert result["processed"] == 0
        assert result["replies_recorded"] == 0

    @patch("warmup_reply_handler.WarmupService")
    @patch("warmup_reply_handler.WarmupDomainRepository")
    def test_no_recipients_skipped(self, mock_repo_cls, mock_svc_cls):
        """Test handling event with no recipients."""
        from warmup_reply_handler import handler

        event = {
            "Records": [
                {
                    "ses": {
                        "mail": {"source": "sender@test.com"},
                        "receipt": {"recipients": []},
                    },
                },
            ],
        }
        result = handler(event, None)

        assert result["processed"] == 0


class TestExtractDomain:
    """Tests for domain extraction helper."""

    def test_valid_email(self):
        from warmup_reply_handler import _extract_domain

        assert _extract_domain("user@example.com") == "example.com"

    def test_subdomain(self):
        from warmup_reply_handler import _extract_domain

        assert _extract_domain("user@mail.example.com") == "mail.example.com"

    def test_uppercase_normalized(self):
        from warmup_reply_handler import _extract_domain

        assert _extract_domain("user@EXAMPLE.COM") == "example.com"

    def test_invalid_email(self):
        from warmup_reply_handler import _extract_domain

        assert _extract_domain("not-an-email") is None
