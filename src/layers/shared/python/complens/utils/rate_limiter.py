"""Rate limiting utilities for public endpoints."""

import os
import time
from typing import NamedTuple

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()

# DynamoDB table name
TABLE_NAME = os.environ.get("TABLE_NAME", "complens-dev")

# Rate limit defaults (can be overridden per-endpoint)
DEFAULT_REQUESTS_PER_MINUTE = 10
DEFAULT_REQUESTS_PER_HOUR = 100


class RateLimitResult(NamedTuple):
    """Result of a rate limit check."""

    allowed: bool
    requests_remaining: int
    retry_after: int | None  # Seconds until limit resets


def _get_dynamodb():
    """Get DynamoDB resource."""
    return boto3.resource("dynamodb")


def check_rate_limit(
    identifier: str,
    action: str,
    requests_per_minute: int = DEFAULT_REQUESTS_PER_MINUTE,
    requests_per_hour: int = DEFAULT_REQUESTS_PER_HOUR,
) -> RateLimitResult:
    """Check if a request should be rate limited.

    Uses DynamoDB to track request counts with automatic TTL cleanup.
    Implements a sliding window algorithm with minute and hour buckets.

    Args:
        identifier: Unique identifier (usually IP address or hashed IP).
        action: Action being rate limited (e.g., "form_submit", "page_view").
        requests_per_minute: Max requests allowed per minute.
        requests_per_hour: Max requests allowed per hour.

    Returns:
        RateLimitResult with allowed status and remaining requests.
    """
    table = _get_dynamodb().Table(TABLE_NAME)
    current_time = int(time.time())
    current_minute = current_time // 60
    current_hour = current_time // 3600

    # Keys for minute and hour tracking
    minute_key = f"RATELIMIT#{action}#MIN#{current_minute}"
    hour_key = f"RATELIMIT#{action}#HOUR#{current_hour}"

    try:
        # Increment minute counter with TTL (expires after 2 minutes)
        minute_response = table.update_item(
            Key={"PK": minute_key, "SK": identifier},
            UpdateExpression="SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl",
            ExpressionAttributeNames={"#count": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":zero": 0,
                ":inc": 1,
                ":ttl": current_time + 120,  # 2 minute TTL
            },
            ReturnValues="ALL_NEW",
        )
        minute_count = minute_response["Attributes"]["count"]

        # Check minute limit first (stricter)
        if minute_count > requests_per_minute:
            seconds_until_next_minute = 60 - (current_time % 60)
            logger.warning(
                "Rate limit exceeded (minute)",
                identifier=identifier[:20],  # Truncate for privacy
                action=action,
                count=minute_count,
                limit=requests_per_minute,
            )
            return RateLimitResult(
                allowed=False,
                requests_remaining=0,
                retry_after=seconds_until_next_minute,
            )

        # Increment hour counter with TTL (expires after 2 hours)
        hour_response = table.update_item(
            Key={"PK": hour_key, "SK": identifier},
            UpdateExpression="SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl",
            ExpressionAttributeNames={"#count": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":zero": 0,
                ":inc": 1,
                ":ttl": current_time + 7200,  # 2 hour TTL
            },
            ReturnValues="ALL_NEW",
        )
        hour_count = hour_response["Attributes"]["count"]

        # Check hour limit
        if hour_count > requests_per_hour:
            seconds_until_next_hour = 3600 - (current_time % 3600)
            logger.warning(
                "Rate limit exceeded (hour)",
                identifier=identifier[:20],
                action=action,
                count=hour_count,
                limit=requests_per_hour,
            )
            return RateLimitResult(
                allowed=False,
                requests_remaining=0,
                retry_after=seconds_until_next_hour,
            )

        # Request allowed
        return RateLimitResult(
            allowed=True,
            requests_remaining=min(
                requests_per_minute - minute_count,
                requests_per_hour - hour_count,
            ),
            retry_after=None,
        )

    except ClientError as e:
        # If DynamoDB fails, allow the request but log the error
        logger.error(
            "Rate limiter DynamoDB error",
            error=str(e),
            identifier=identifier[:20],
            action=action,
        )
        return RateLimitResult(allowed=True, requests_remaining=-1, retry_after=None)


def get_client_ip(event: dict) -> str:
    """Extract client IP from API Gateway event.

    Handles X-Forwarded-For header for requests behind CloudFront/ALB.

    Args:
        event: API Gateway event dict.

    Returns:
        Client IP address string.
    """
    headers = event.get("headers", {}) or {}
    request_context = event.get("requestContext", {}) or {}
    identity = request_context.get("identity", {}) or {}

    # Check X-Forwarded-For first (may have multiple IPs from proxies)
    forwarded_for = headers.get("X-Forwarded-For") or headers.get("x-forwarded-for")
    if forwarded_for:
        # Take the first IP (original client)
        return forwarded_for.split(",")[0].strip()

    # Fall back to source IP from API Gateway
    return identity.get("sourceIp", "unknown")


def rate_limit_response(retry_after: int) -> dict:
    """Generate a 429 Too Many Requests response.

    Args:
        retry_after: Seconds until the client can retry.

    Returns:
        API Gateway response dict.
    """
    from complens.utils.responses import CORS_HEADERS

    return {
        "statusCode": 429,
        "headers": {
            **CORS_HEADERS,
            "Retry-After": str(retry_after),
        },
        "body": '{"error": true, "message": "Too many requests. Please try again later.", "error_code": "RATE_LIMITED"}',
    }
