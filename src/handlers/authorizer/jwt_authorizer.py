"""JWT Authorizer for API Gateway.

Validates Cognito JWT tokens and extracts user context.
"""

import json
import os
import time
from typing import Any
from urllib.request import urlopen

import jwt
import structlog

logger = structlog.get_logger()

# Cache for JWKS
_jwks_cache: dict[str, Any] = {}
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


def handler(event: dict[str, Any], context: Any) -> dict:
    """Lambda authorizer handler for API Gateway.

    Args:
        event: API Gateway authorizer event.
        context: Lambda context.

    Returns:
        IAM policy document with context.
    """
    logger.info("Authorizer invoked")

    try:
        # Get token from headers
        token = _extract_token(event)
        if not token:
            logger.warning("No token provided")
            return _deny_policy(event)

        # Get Cognito configuration
        user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
        region = os.environ.get("COGNITO_REGION", os.environ.get("AWS_REGION", "us-east-1"))

        if not user_pool_id:
            logger.error("COGNITO_USER_POOL_ID not configured")
            return _deny_policy(event)

        # Validate token
        claims = _validate_token(token, user_pool_id, region)
        if not claims:
            logger.warning("Token validation failed")
            return _deny_policy(event)

        # Build context for downstream functions
        auth_context = {
            "userId": claims.get("sub"),
            "email": claims.get("email"),
            "agencyId": claims.get("custom:agency_id", ""),
            "workspaceIds": claims.get("custom:workspace_ids", ""),
            "isAdmin": claims.get("custom:is_admin", "false"),
            "isSuperAdmin": claims.get("custom:is_super_admin", "false"),
        }

        logger.info(
            "Authorization successful",
            user_id=auth_context["userId"],
            email=auth_context["email"],
        )

        return _allow_policy(event, auth_context)

    except Exception as e:
        logger.exception("Authorizer error", error=str(e))
        return _deny_policy(event)


def _extract_token(event: dict) -> str | None:
    """Extract JWT token from event.

    Args:
        event: API Gateway event.

    Returns:
        Token string or None.
    """
    # Try headers first
    headers = event.get("headers", {}) or {}

    # Headers might be case-insensitive
    auth_header = headers.get("Authorization") or headers.get("authorization")

    if auth_header:
        # Bearer token format
        if auth_header.startswith("Bearer "):
            return auth_header[7:]
        return auth_header

    # Try identitySource for REQUEST authorizer
    identity_source = event.get("identitySource")
    if identity_source:
        if isinstance(identity_source, list):
            for source in identity_source:
                if source and source.startswith("Bearer "):
                    return source[7:]
                elif source:
                    return source
        elif isinstance(identity_source, str):
            if identity_source.startswith("Bearer "):
                return identity_source[7:]
            return identity_source

    return None


def _validate_token(token: str, user_pool_id: str, region: str) -> dict | None:
    """Validate JWT token against Cognito JWKS.

    Args:
        token: JWT token string.
        user_pool_id: Cognito User Pool ID.
        region: AWS region.

    Returns:
        Token claims if valid, None otherwise.
    """
    global _jwks_cache, _jwks_cache_time

    # Build JWKS URL
    jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"

    # Get JWKS (with caching)
    current_time = time.time()
    if not _jwks_cache or (current_time - _jwks_cache_time) > JWKS_CACHE_TTL:
        try:
            with urlopen(jwks_url, timeout=10) as response:
                _jwks_cache = json.loads(response.read().decode("utf-8"))
                _jwks_cache_time = current_time
                logger.info("JWKS cache refreshed")
        except Exception as e:
            logger.error("Failed to fetch JWKS", error=str(e))
            if not _jwks_cache:
                return None

    # Get the key ID from the token header
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except jwt.exceptions.DecodeError:
        logger.warning("Failed to decode token header")
        return None

    # Find the matching key
    public_key = None
    for key in _jwks_cache.get("keys", []):
        if key.get("kid") == kid:
            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
            break

    if not public_key:
        logger.warning("No matching key found in JWKS", kid=kid)
        return None

    # Verify and decode the token
    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=None,  # Cognito doesn't use audience by default
            options={
                "verify_aud": False,
                "verify_iss": True,
                "verify_exp": True,
            },
            issuer=f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}",
        )
        return claims

    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token", error=str(e))
        return None


def _allow_policy(event: dict, context: dict) -> dict:
    """Build an allow policy.

    Args:
        event: API Gateway event.
        context: Auth context to pass to downstream.

    Returns:
        Policy document.
    """
    method_arn = event.get("methodArn", event.get("routeArn", "*"))

    # For REST API, allow all methods on the API
    # Extract the base ARN (remove method and resource path)
    arn_parts = method_arn.split("/")
    if len(arn_parts) >= 2:
        # Build wildcard ARN for all resources
        base_arn = "/".join(arn_parts[:2])
        resource_arn = f"{base_arn}/*"
    else:
        resource_arn = "*"

    return {
        "principalId": context.get("userId", "user"),
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow",
                    "Resource": resource_arn,
                }
            ],
        },
        "context": context,
    }


def _deny_policy(event: dict) -> dict:
    """Build a deny policy.

    Args:
        event: API Gateway event.

    Returns:
        Policy document.
    """
    method_arn = event.get("methodArn", event.get("routeArn", "*"))

    return {
        "principalId": "unauthorized",
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Deny",
                    "Resource": method_arn,
                }
            ],
        },
    }
