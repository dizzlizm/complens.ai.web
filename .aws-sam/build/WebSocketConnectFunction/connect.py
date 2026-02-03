"""WebSocket connect handler."""

import json
import os
import time
from typing import Any
from urllib.request import urlopen

import boto3
import jwt
import structlog

logger = structlog.get_logger()

# Cache for JWKS
_jwks_cache: dict[str, Any] = {}
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle WebSocket connection.

    Args:
        event: API Gateway WebSocket event.
        context: Lambda context.

    Returns:
        Connection response.
    """
    connection_id = event.get("requestContext", {}).get("connectionId")

    if not connection_id:
        logger.error("No connection ID in event")
        return {"statusCode": 400}

    logger.info("WebSocket connect", connection_id=connection_id)

    # Get query parameters for auth
    query_params = event.get("queryStringParameters", {}) or {}
    token = query_params.get("token")

    # Validate token and get user info
    user_id = None
    workspace_ids = []

    # Check if this is a public channel (e.g., public page chat)
    is_public = _is_public_channel(event)

    if token:
        try:
            user_info = _validate_token(token)
            user_id = user_info.get("user_id")
            workspace_ids = user_info.get("workspace_ids", [])
        except Exception as e:
            # SECURITY: Token was provided but validation failed - reject the connection
            # This prevents attackers from connecting with invalid/expired tokens
            logger.warning(
                "SECURITY: WebSocket token validation failed - rejecting connection",
                error=str(e),
                connection_id=connection_id,
            )
            return {
                "statusCode": 401,
                "body": json.dumps({"error": "Authentication failed"}),
            }
    else:
        # No token provided
        if is_public:
            # Allow anonymous access for public channels (e.g., public page chat)
            logger.info(
                "Anonymous WebSocket connection for public channel",
                connection_id=connection_id,
            )
            user_id = "anonymous"
        else:
            # SECURITY: Reject unauthenticated connections to non-public channels
            logger.warning(
                "SECURITY: WebSocket connection rejected - no token for authenticated endpoint",
                connection_id=connection_id,
            )
            return {
                "statusCode": 401,
                "body": json.dumps({"error": "Authentication required"}),
            }

    # Store connection in DynamoDB
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(os.environ.get("CONNECTIONS_TABLE", "complens-dev-connections"))

    ttl = int(time.time()) + 86400  # 24 hours

    # Build connection item
    item = {
        "connectionId": connection_id,
        "userId": user_id or "anonymous",
        "workspaceIds": workspace_ids,
        "connectedAt": int(time.time()),
        "ttl": ttl,
    }

    # Add primary workspaceId for GSI (enables efficient workspace lookups)
    # For users with multiple workspaces, we index the first one
    # The full list is still in workspaceIds for contains() lookups
    if workspace_ids:
        item["workspaceId"] = workspace_ids[0]

    table.put_item(Item=item)

    logger.info(
        "Connection stored",
        connection_id=connection_id,
        user_id=user_id,
    )

    return {"statusCode": 200}


def _validate_token(token: str) -> dict:
    """Validate JWT token against Cognito JWKS.

    Args:
        token: JWT token.

    Returns:
        User info dict with user_id, email, workspace_ids if valid.

    Raises:
        Exception: If token validation fails.
    """
    global _jwks_cache, _jwks_cache_time

    # Get Cognito configuration
    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
    region = os.environ.get("COGNITO_REGION", os.environ.get("AWS_REGION", "us-east-1"))

    if not user_pool_id:
        logger.warning("COGNITO_USER_POOL_ID not configured, rejecting token")
        raise ValueError("Cognito not configured")

    # Build JWKS URL
    jwks_url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"

    # Get JWKS (with caching)
    current_time = time.time()
    if not _jwks_cache or (current_time - _jwks_cache_time) > JWKS_CACHE_TTL:
        try:
            with urlopen(jwks_url, timeout=10) as response:
                _jwks_cache = json.loads(response.read().decode("utf-8"))
                _jwks_cache_time = current_time
                logger.info("JWKS cache refreshed for WebSocket")
        except Exception as e:
            logger.error("Failed to fetch JWKS", error=str(e))
            if not _jwks_cache:
                raise ValueError("Cannot fetch JWKS")

    # Get the key ID from the token header
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
    except jwt.exceptions.DecodeError as e:
        logger.warning("Failed to decode token header", error=str(e))
        raise ValueError("Invalid token header")

    # Find the matching key
    public_key = None
    for key in _jwks_cache.get("keys", []):
        if key.get("kid") == kid:
            public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
            break

    if not public_key:
        logger.warning("No matching key found in JWKS", kid=kid)
        raise ValueError("No matching key")

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

        workspace_ids_str = claims.get("custom:workspace_ids", "")
        workspace_ids = [ws.strip() for ws in workspace_ids_str.split(",") if ws.strip()]

        return {
            "user_id": claims.get("sub"),
            "email": claims.get("email"),
            "workspace_ids": workspace_ids,
        }

    except jwt.ExpiredSignatureError:
        logger.warning("WebSocket token has expired")
        raise ValueError("Token expired")
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid WebSocket token", error=str(e))
        raise ValueError("Invalid token")


def _is_public_channel(event: dict[str, Any]) -> bool:
    """Check if this WebSocket connection is for a public channel.

    Public channels allow anonymous access for features like public page chat.

    Args:
        event: API Gateway WebSocket event.

    Returns:
        True if this is a public channel that allows anonymous access.
    """
    query_params = event.get("queryStringParameters", {}) or {}

    # Check for explicit public channel marker
    channel = query_params.get("channel", "")
    if channel == "public":
        return True

    # Check for page_id parameter (indicates public page chat)
    page_id = query_params.get("page_id")
    if page_id:
        return True

    # Check route key for public paths
    route_key = event.get("requestContext", {}).get("routeKey", "")
    if route_key.startswith("public"):
        return True

    return False
