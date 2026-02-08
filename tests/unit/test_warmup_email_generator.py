"""Tests for WarmupEmailGenerator."""

import os
from unittest.mock import MagicMock, patch

import pytest

os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"


class TestWarmupEmailGenerator:
    """Tests for AI warmup email generation."""

    def _make_generator(self):
        from complens.services.warmup_email_generator import WarmupEmailGenerator
        return WarmupEmailGenerator()

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_generate_email_success(self, mock_context, mock_invoke):
        """Test successful email generation."""
        mock_context.return_value = "A software company"
        mock_invoke.return_value = {
            "subject": "Quick update from the team",
            "body_text": "Hi there, just a quick note...",
            "body_html": "<p>Hi there, just a quick note...</p>",
        }

        generator = self._make_generator()
        result = generator.generate_email(
            workspace_id="ws-1",
            domain="example.com",
            recipient_email="user@test.com",
        )

        assert "subject" in result
        assert "body_text" in result
        assert "body_html" in result
        assert "content_type" in result
        mock_invoke.assert_called_once()

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_generate_email_with_exclude_subjects(self, mock_context, mock_invoke):
        """Test that exclude_subjects are passed to the prompt."""
        mock_context.return_value = ""
        mock_invoke.return_value = {
            "subject": "New topic",
            "body_text": "Hello",
            "body_html": "<p>Hello</p>",
        }

        generator = self._make_generator()
        result = generator.generate_email(
            workspace_id="ws-1",
            domain="example.com",
            recipient_email="user@test.com",
            exclude_subjects=["Old subject 1", "Old subject 2"],
        )

        assert result["subject"] == "New topic"
        # Verify exclude_subjects appeared in the prompt
        call_args = mock_invoke.call_args
        assert "Old subject 1" in call_args.kwargs.get("prompt", call_args.args[0] if call_args.args else "")

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_generate_email_ai_failure_uses_fallback(self, mock_context, mock_invoke):
        """Test fallback email when AI generation fails."""
        mock_context.return_value = ""
        mock_invoke.side_effect = Exception("Bedrock unavailable")

        generator = self._make_generator()
        result = generator.generate_email(
            workspace_id="ws-1",
            domain="example.com",
            recipient_email="user@test.com",
        )

        # Should get fallback email
        assert "subject" in result
        assert "body_text" in result
        assert "body_html" in result
        assert "example.com" in result["body_text"]

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_generate_email_missing_fields_uses_fallback(self, mock_context, mock_invoke):
        """Test fallback when AI returns incomplete response."""
        mock_context.return_value = ""
        mock_invoke.return_value = {
            "subject": "Only subject, no body",
        }

        generator = self._make_generator()
        result = generator.generate_email(
            workspace_id="ws-1",
            domain="example.com",
            recipient_email="user@test.com",
        )

        # Should get fallback since body_text and body_html are missing
        assert "example.com" in result["body_text"]

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_business_context_error_handled(self, mock_context, mock_invoke):
        """Test that business context errors don't block generation."""
        mock_context.side_effect = Exception("DB error")
        mock_invoke.return_value = {
            "subject": "Test subject",
            "body_text": "Test body",
            "body_html": "<p>Test body</p>",
        }

        generator = self._make_generator()
        result = generator.generate_email(
            workspace_id="ws-1",
            domain="example.com",
            recipient_email="user@test.com",
        )

        assert result["subject"] == "Test subject"

    def test_fallback_email(self):
        """Test static fallback email generation."""
        from complens.services.warmup_email_generator import WarmupEmailGenerator

        result = WarmupEmailGenerator._fallback_email("example.com", "newsletter")

        assert "example.com" in result["subject"]
        assert "example.com" in result["body_text"]
        assert "example.com" in result["body_html"]
        assert result["content_type"] == "newsletter"

    @patch("complens.services.warmup_email_generator.invoke_claude_json")
    @patch("complens.services.warmup_email_generator.get_business_context")
    def test_content_type_randomization(self, mock_context, mock_invoke):
        """Test that content types are varied across calls."""
        mock_context.return_value = ""
        mock_invoke.return_value = {
            "subject": "Test",
            "body_text": "Test",
            "body_html": "<p>Test</p>",
        }

        generator = self._make_generator()
        content_types = set()

        for _ in range(20):
            result = generator.generate_email(
                workspace_id="ws-1",
                domain="example.com",
                recipient_email="user@test.com",
            )
            content_types.add(result["content_type"])

        # Should have at least 2 different content types over 20 calls
        assert len(content_types) >= 2
