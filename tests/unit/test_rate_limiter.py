"""Tests for the rate limiter utility."""

import json

import pytest

from complens.utils.rate_limiter import (
    RateLimitResult,
    check_rate_limit,
    get_client_ip,
    rate_limit_response,
)


class TestRateLimiter:
    """Tests for check_rate_limit and rate_limit_response."""

    def test_rate_limit_allows_under_limit(self, dynamodb_table):
        """Requests under the limit should be allowed."""
        result = check_rate_limit(
            identifier="test-ip",
            action="test",
            requests_per_minute=5,
        )

        assert result.allowed is True
        assert result.requests_remaining >= 0
        assert result.retry_after is None

    def test_rate_limit_blocks_over_minute(self, dynamodb_table):
        """Exceeding the per-minute limit should block the request."""
        for _ in range(5):
            result = check_rate_limit(
                identifier="test-ip",
                action="test",
                requests_per_minute=5,
            )
            assert result.allowed is True

        # The 6th request should be blocked
        result = check_rate_limit(
            identifier="test-ip",
            action="test",
            requests_per_minute=5,
        )

        assert result.allowed is False
        assert result.requests_remaining == 0
        assert result.retry_after is not None
        assert result.retry_after > 0

    def test_rate_limit_blocks_over_hour(self, dynamodb_table):
        """Exceeding the per-hour limit should block the request."""
        # Set per-minute high so we only hit the hour limit
        for _ in range(3):
            result = check_rate_limit(
                identifier="test-ip",
                action="test",
                requests_per_minute=100,
                requests_per_hour=3,
            )
            assert result.allowed is True

        # The 4th request should be blocked by the hour limit
        result = check_rate_limit(
            identifier="test-ip",
            action="test",
            requests_per_minute=100,
            requests_per_hour=3,
        )

        assert result.allowed is False
        assert result.requests_remaining == 0
        assert result.retry_after is not None
        assert result.retry_after > 0

    def test_rate_limit_different_identifiers(self, dynamodb_table):
        """Different identifiers should have independent rate limits."""
        # Exhaust the limit for ip-1
        for _ in range(5):
            check_rate_limit(
                identifier="ip-1",
                action="test",
                requests_per_minute=5,
            )

        # ip-2 should still be allowed
        result = check_rate_limit(
            identifier="ip-2",
            action="test",
            requests_per_minute=5,
        )

        assert result.allowed is True
        assert result.requests_remaining >= 0
        assert result.retry_after is None

    def test_rate_limit_response_format(self):
        """rate_limit_response should return a proper 429 response."""
        response = rate_limit_response(30)

        assert response["statusCode"] == 429
        assert response["headers"]["Retry-After"] == "30"

        body = json.loads(response["body"])
        assert body["error"] is True
        assert "message" in body
        assert body["error_code"] == "RATE_LIMITED"


class TestGetClientIp:
    """Tests for get_client_ip."""

    def test_get_client_ip_from_forwarded_for(self):
        """Should extract the first IP from X-Forwarded-For header."""
        event = {
            "headers": {
                "X-Forwarded-For": "1.2.3.4, 5.6.7.8",
            },
            "requestContext": {},
        }

        assert get_client_ip(event) == "1.2.3.4"

    def test_get_client_ip_from_source_ip(self):
        """Should fall back to requestContext.identity.sourceIp."""
        event = {
            "headers": {},
            "requestContext": {
                "identity": {
                    "sourceIp": "10.0.0.1",
                },
            },
        }

        assert get_client_ip(event) == "10.0.0.1"

    def test_get_client_ip_unknown(self):
        """Should return 'unknown' when no IP info is available."""
        event = {
            "headers": {},
            "requestContext": {},
        }

        assert get_client_ip(event) == "unknown"
