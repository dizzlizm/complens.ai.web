"""Security tests for authorization and access control.

These tests verify that:
- Users cannot access resources in workspaces they don't belong to
- Workspace ID cannot be forged via request body
- Proper error responses are returned for unauthorized access
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# Add handlers to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src", "handlers"))


class TestConversationAuthorization:
    """Test authorization for conversation endpoints."""

    def test_get_conversation_requires_workspace_access(self, api_gateway_event, sample_conversation):
        """Verify users cannot access conversations in other workspaces."""
        from api.conversations import handler

        # User has access to workspace-A but conversation is in workspace-B
        event = api_gateway_event(
            method="GET",
            path="/conversations/conv-123",
            path_params={"conversation_id": "conv-123"},
            workspace_ids=["workspace-A"],  # User only has access to workspace-A
        )

        # Mock the conversation repository to return conversation in workspace-B
        with patch("complens.repositories.conversation.ConversationRepository.get_by_id") as mock_get:
            with patch("complens.repositories.workspace.WorkspaceRepository.get_by_id") as mock_ws_get:
                # Conversation belongs to workspace-B (not workspace-A)
                mock_conversation = MagicMock()
                mock_conversation.workspace_id = "workspace-B"
                mock_conversation.model_dump.return_value = {"id": "conv-123", "workspace_id": "workspace-B"}
                mock_get.return_value = mock_conversation

                # Workspace exists but user doesn't have access
                mock_workspace = MagicMock()
                mock_ws_get.return_value = mock_workspace

                response = handler(event, None)

                # Should return 403 Forbidden
                assert response["statusCode"] == 403
                body = json.loads(response["body"])
                # Error response has {"error": true, "message": "Access denied"}
                assert body.get("error") is True
                assert "denied" in body.get("message", "").lower() or "access" in body.get("message", "").lower()

    def test_get_conversation_returns_404_for_nonexistent(self, api_gateway_event):
        """Verify 404 is returned for non-existent conversations."""
        from api.conversations import handler

        event = api_gateway_event(
            method="GET",
            path="/conversations/nonexistent-id",
            path_params={"conversation_id": "nonexistent-id"},
        )

        with patch("api.conversations.ConversationRepository") as mock_repo_class:
            mock_repo = MagicMock()
            mock_repo_class.return_value = mock_repo
            mock_repo.get_by_id.return_value = None

            response = handler(event, None)

            assert response["statusCode"] == 404


class TestMessageAuthorization:
    """Test authorization for message creation."""

    def test_create_message_uses_conversation_workspace_id(self, api_gateway_event):
        """Verify workspace_id is taken from conversation, not request body."""
        from api.messages import handler

        # Attacker tries to forge workspace_id in request body
        event = api_gateway_event(
            method="POST",
            path="/conversations/conv-123/messages",
            path_params={"conversation_id": "conv-123"},
            body={
                "workspace_id": "attacker-workspace",  # Should be ignored
                "content": "Test message",
                "channel": "sms",  # Required field
            },
            workspace_ids=["legitimate-workspace"],
        )

        with patch("complens.repositories.conversation.ConversationRepository.get_by_id") as mock_conv_get:
            with patch("complens.repositories.workspace.WorkspaceRepository.get_by_id") as mock_ws_get:
                # Conversation belongs to attacker's target (different workspace)
                mock_conversation = MagicMock()
                mock_conversation.workspace_id = "target-workspace"
                mock_conversation.contact_id = "contact-123"
                mock_conv_get.return_value = mock_conversation

                # Workspace exists
                mock_workspace = MagicMock()
                mock_ws_get.return_value = mock_workspace

                response = handler(event, None)

                # Should return 403 because user doesn't have access to target-workspace
                assert response["statusCode"] == 403

    def test_create_message_requires_valid_conversation(self, api_gateway_event):
        """Verify message creation fails for non-existent conversations."""
        from api.messages import handler

        event = api_gateway_event(
            method="POST",
            path="/conversations/fake-conv/messages",
            path_params={"conversation_id": "fake-conv"},
            body={
                "content": "Test message",
                "channel": "sms",  # Required field
            },
        )

        with patch("complens.repositories.conversation.ConversationRepository.get_by_id") as mock_conv_get:
            mock_conv_get.return_value = None

            response = handler(event, None)

            assert response["statusCode"] == 404


class TestWebSocketAuthentication:
    """Test WebSocket authentication security."""

    def test_websocket_rejects_invalid_token(self):
        """Verify WebSocket connections are rejected when token validation fails."""
        from websocket.connect import handler

        event = {
            "requestContext": {"connectionId": "test-conn-123"},
            "queryStringParameters": {"token": "invalid-token-xyz"},
        }

        with patch("websocket.connect._validate_token") as mock_validate:
            with patch("websocket.connect.boto3") as mock_boto3:
                # Token validation fails
                mock_validate.side_effect = ValueError("Invalid token")

                # Mock DynamoDB table
                mock_table = MagicMock()
                mock_boto3.resource.return_value.Table.return_value = mock_table

                response = handler(event, None)

                # Should reject with 401
                assert response["statusCode"] == 401
                # Should NOT store the connection
                mock_table.put_item.assert_not_called()

    def test_websocket_allows_public_channel_without_token(self):
        """Verify WebSocket allows anonymous connections for public channels."""
        from websocket.connect import handler

        event = {
            "requestContext": {"connectionId": "test-conn-123"},
            "queryStringParameters": {"channel": "public", "page_id": "page-123"},
        }

        with patch("websocket.connect.boto3") as mock_boto3:
            mock_table = MagicMock()
            mock_boto3.resource.return_value.Table.return_value = mock_table

            response = handler(event, None)

            # Should allow connection for public channel
            assert response["statusCode"] == 200
            # Should store connection as anonymous
            mock_table.put_item.assert_called_once()
            stored_item = mock_table.put_item.call_args[1]["Item"]
            assert stored_item["userId"] == "anonymous"

    def test_websocket_rejects_authenticated_endpoint_without_token(self):
        """Verify WebSocket rejects connections to authenticated endpoints without token."""
        from websocket.connect import handler

        event = {
            "requestContext": {"connectionId": "test-conn-123"},
            "queryStringParameters": {},  # No token, no public channel indicator
        }

        with patch("websocket.connect.boto3") as mock_boto3:
            mock_table = MagicMock()
            mock_boto3.resource.return_value.Table.return_value = mock_table

            response = handler(event, None)

            # Should reject with 401
            assert response["statusCode"] == 401


class TestCssSanitization:
    """Test CSS sanitization for injection prevention."""

    def test_sanitize_css_blocks_import(self):
        """Verify @import is blocked and removed."""
        from complens.utils.css_sanitizer import sanitize_css

        dangerous_css = "@import url('https://evil.com/steal.css');"
        result = sanitize_css(dangerous_css, log_blocked=False)

        # Dangerous content should be removed (cleanup phase removes /* blocked */ comments too)
        assert "@import" not in result
        assert "evil.com" not in result

    def test_sanitize_css_blocks_external_urls(self):
        """Verify external url() references are blocked and removed."""
        from complens.utils.css_sanitizer import sanitize_css

        # External URL should be blocked
        dangerous_css = "background: url('https://evil.com/track.png');"
        result = sanitize_css(dangerous_css, log_blocked=False)

        # External URL should be completely removed
        assert "evil.com" not in result
        assert "url(" not in result or "data:image" in result

    def test_sanitize_css_allows_data_urls(self):
        """Verify data: image URLs are allowed."""
        from complens.utils.css_sanitizer import sanitize_css

        safe_css = "background: url(data:image/png;base64,abc123);"
        result = sanitize_css(safe_css, log_blocked=False)

        assert "data:image/png" in result
        assert "/* blocked */" not in result

    def test_sanitize_css_blocks_javascript(self):
        """Verify javascript: protocol is blocked."""
        from complens.utils.css_sanitizer import sanitize_css

        dangerous_css = "background: url(javascript:alert(1));"
        result = sanitize_css(dangerous_css, log_blocked=False)

        assert "javascript:" not in result

    def test_sanitize_css_blocks_expression(self):
        """Verify CSS expressions are blocked."""
        from complens.utils.css_sanitizer import sanitize_css

        dangerous_css = "width: expression(alert(document.cookie));"
        result = sanitize_css(dangerous_css, log_blocked=False)

        assert "expression(" not in result

    def test_is_safe_css_returns_false_for_dangerous(self):
        """Verify is_safe_css correctly identifies dangerous CSS."""
        from complens.utils.css_sanitizer import is_safe_css

        assert not is_safe_css("@import url('evil.css');")
        assert not is_safe_css("background: url(javascript:alert(1));")
        assert not is_safe_css("width: expression(alert(1));")

    def test_is_safe_css_returns_true_for_safe(self):
        """Verify is_safe_css allows safe CSS."""
        from complens.utils.css_sanitizer import is_safe_css

        assert is_safe_css("color: red; background: blue;")
        assert is_safe_css(".class { margin: 10px; }")
        assert is_safe_css(None)
        assert is_safe_css("")


class TestOAuthStateSecurity:
    """Test OAuth state parameter encryption and verification."""

    def test_encrypt_decrypt_roundtrip(self):
        """Verify state can be encrypted and decrypted."""
        # Set the encryption key for testing
        os.environ["OAUTH_STATE_SECRET"] = "test-secret-key-32-chars-long!!"

        from complens.services.stripe_service import decrypt_oauth_state, encrypt_oauth_state

        original_data = {"workspace_id": "ws-123", "custom": "test"}

        encrypted = encrypt_oauth_state(original_data)
        decrypted = decrypt_oauth_state(encrypted)

        assert decrypted["workspace_id"] == original_data["workspace_id"]
        assert decrypted["custom"] == original_data["custom"]

    def test_decrypt_rejects_tampered_state(self):
        """Verify tampered state is rejected."""
        os.environ["OAUTH_STATE_SECRET"] = "test-secret-key-32-chars-long!!"

        from complens.services.stripe_service import StripeError, encrypt_oauth_state, decrypt_oauth_state

        # Get valid encrypted state
        encrypted = encrypt_oauth_state({"workspace_id": "ws-123"})

        # Tamper with it (change one character)
        tampered = encrypted[:-5] + "XXXXX"

        with pytest.raises(StripeError) as exc_info:
            decrypt_oauth_state(tampered)

        assert "invalid" in str(exc_info.value.message).lower()

    def test_decrypt_rejects_expired_state(self):
        """Verify expired state tokens are rejected."""
        import time
        os.environ["OAUTH_STATE_SECRET"] = "test-secret-key-32-chars-long!!"

        from complens.services.stripe_service import StripeError, decrypt_oauth_state

        # Create a state with old timestamp (manually construct to bypass expiry)
        import base64
        import hashlib
        import hmac

        old_data = {"workspace_id": "ws-123", "_ts": int(time.time()) - 600}  # 10 minutes ago
        payload = json.dumps(old_data, separators=(",", ":"))
        signature = hmac.new(
            "test-secret-key-32-chars-long!!".encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        expired_state = base64.urlsafe_b64encode(f"{payload}:{signature}".encode()).decode()

        with pytest.raises(StripeError) as exc_info:
            decrypt_oauth_state(expired_state)

        assert "expired" in str(exc_info.value.message).lower()


class TestStripeWebhookSecurity:
    """Test Stripe webhook signature verification."""

    def test_webhook_rejects_missing_signature(self):
        """Verify webhook is rejected without signature header."""
        from webhooks.stripe_webhook import handler

        event = {
            "headers": {},  # No Stripe-Signature header
            "body": "{}",
            "pathParameters": {"workspace_id": "ws-123"},
        }

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert "signature" in body.get("error", "").lower()

    def test_webhook_rejects_invalid_signature(self):
        """Verify webhook is rejected with invalid signature."""
        from webhooks.stripe_webhook import handler

        event = {
            "headers": {"Stripe-Signature": "invalid-sig"},
            "body": '{"type": "test"}',
            "pathParameters": {"workspace_id": "ws-123"},
        }

        with patch("webhooks.stripe_webhook.verify_webhook_signature") as mock_verify:
            from complens.services.stripe_service import StripeError
            mock_verify.side_effect = StripeError("Invalid signature", "invalid_signature")

            response = handler(event, None)

            assert response["statusCode"] == 400


class TestTwilioWebhookSecurity:
    """Test Twilio webhook signature validation."""

    def test_twilio_rejects_missing_signature(self):
        """Verify Twilio webhook is rejected without signature."""
        from webhooks.twilio_inbound import handler

        event = {
            "headers": {},  # No X-Twilio-Signature
            "body": "From=%2B15551234567&To=%2B15559876543&Body=Hello",
            "path": "/webhooks/twilio/sms",
            "requestContext": {"domainName": "api.example.com", "stage": "dev"},
        }

        # Set auth token to enable validation
        os.environ["TWILIO_AUTH_TOKEN"] = "test-token"

        response = handler(event, None)

        assert response["statusCode"] == 403

    def test_twilio_rejects_invalid_signature(self):
        """Verify Twilio webhook is rejected with invalid signature."""
        from webhooks.twilio_inbound import handler

        event = {
            "headers": {"X-Twilio-Signature": "invalid-sig"},
            "body": "From=%2B15551234567&To=%2B15559876543&Body=Hello",
            "path": "/webhooks/twilio/sms",
            "requestContext": {"domainName": "api.example.com", "stage": "dev"},
        }

        os.environ["TWILIO_AUTH_TOKEN"] = "test-token"

        # Patch at the twilio library level since it's imported inside the function
        with patch("twilio.request_validator.RequestValidator") as mock_validator_class:
            mock_validator = MagicMock()
            mock_validator_class.return_value = mock_validator
            mock_validator.validate.return_value = False

            response = handler(event, None)

            assert response["statusCode"] == 403


class TestWebSocketMessageValidation:
    """Test WebSocket message handling security."""

    def test_public_chat_requires_workspace_id(self):
        """Verify public chat rejects requests without workspace_id."""
        from websocket.message import handler

        event = {
            "requestContext": {
                "connectionId": "conn-123",
                "domainName": "ws.example.com",
                "stage": "dev",
            },
            "body": json.dumps({
                "action": "public_chat",
                "page_id": "page-123",
                "message": "Hello",
                # Missing workspace_id
            }),
        }

        with patch("websocket.message.send_to_connection") as mock_send:
            response = handler(event, None)

            assert response["statusCode"] == 400
            # Should send error to client
            mock_send.assert_called_once()
            call_args = mock_send.call_args
            message = call_args[0][3]  # Fourth arg is message dict
            assert "error" in message.get("message", "").lower() or "config" in message.get("message", "").lower()
