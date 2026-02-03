"""Stripe Connect API handlers.

Handles Stripe Connect OAuth flow and account management.
"""

import json
import os
from typing import Any

import structlog
from pydantic import BaseModel, Field

from complens.repositories.workspace import WorkspaceRepository
from complens.services.stripe_service import (
    StripeError,
    complete_connect_oauth,
    decrypt_oauth_state,
    generate_connect_oauth_url,
    get_account_status,
)
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.responses import created, error, success, validation_error

logger = structlog.get_logger()


class ConnectRequest(BaseModel):
    """Request to initiate Stripe Connect OAuth."""

    redirect_uri: str = Field(..., description="URL to redirect after OAuth")


class OAuthCallbackRequest(BaseModel):
    """OAuth callback data."""

    code: str = Field(..., description="Authorization code from Stripe")
    state: str = Field(..., description="State parameter with workspace_id")


class DisconnectRequest(BaseModel):
    """Request to disconnect Stripe account."""

    confirm: bool = Field(default=False, description="Confirm disconnection")


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle Stripe API requests.

    Args:
        event: API Gateway event.
        context: Lambda context.

    Returns:
        Response dict.
    """
    http_method = event.get("httpMethod", "")
    path = event.get("path", "")
    path_params = event.get("pathParameters", {}) or {}

    logger.info("Stripe API request", method=http_method, path=path)

    try:
        auth = get_auth_context(event)

        # Route based on path
        if "/connect/start" in path and http_method == "POST":
            workspace_id = path_params.get("workspace_id")
            require_workspace_access(auth, workspace_id)
            return start_connect(workspace_id, event)

        elif "/connect/callback" in path and http_method == "POST":
            # OAuth callback - workspace_id in state parameter
            return handle_oauth_callback(event)

        elif "/connect/status" in path and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            require_workspace_access(auth, workspace_id)
            return get_connect_status(workspace_id)

        elif "/connect/disconnect" in path and http_method == "POST":
            workspace_id = path_params.get("workspace_id")
            require_workspace_access(auth, workspace_id)
            return disconnect_account(workspace_id, event)

        else:
            return error(f"Not found: {path}", 404)

    except ValueError as e:
        return error(str(e), 403)
    except Exception as e:
        logger.exception("Stripe handler error", error=str(e))
        return error("Internal server error", 500)


def start_connect(workspace_id: str, event: dict) -> dict:
    """Start Stripe Connect OAuth flow.

    Args:
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        Response with OAuth URL.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = ConnectRequest.model_validate(body)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    except Exception as e:
        return validation_error([{"field": "body", "message": str(e)}])

    logger.info("Starting Stripe Connect", workspace_id=workspace_id)

    try:
        oauth_url = generate_connect_oauth_url(
            workspace_id=workspace_id,
            redirect_uri=request.redirect_uri,
        )

        return success({
            "oauth_url": oauth_url,
            "message": "Redirect user to this URL to connect Stripe",
        })

    except StripeError as e:
        return error(e.message, 400, error_code=e.code)


def handle_oauth_callback(event: dict) -> dict:
    """Handle OAuth callback from Stripe.

    SECURITY: The state parameter is decrypted and verified to ensure:
    - The callback is for a legitimate OAuth flow we initiated
    - The workspace_id hasn't been tampered with
    - The state hasn't expired (prevents replay attacks)

    Args:
        event: API Gateway event.

    Returns:
        Response with connection status.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = OAuthCallbackRequest.model_validate(body)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    except Exception as e:
        return validation_error([{"field": "body", "message": str(e)}])

    # SECURITY: Decrypt and verify state parameter
    try:
        state_data = decrypt_oauth_state(request.state)
        workspace_id = state_data.get("workspace_id")
    except StripeError as e:
        logger.warning(
            "SECURITY: OAuth state validation failed",
            error=e.message,
            code=e.code,
        )
        return error(f"Invalid state: {e.message}", 400, error_code=e.code)

    if not workspace_id:
        logger.warning("SECURITY: OAuth state missing workspace_id")
        return error("Workspace ID not found in state", 400)

    logger.info("Processing OAuth callback", workspace_id=workspace_id)

    try:
        # Exchange code for access token
        token_data = complete_connect_oauth(request.code)

        stripe_user_id = token_data.get("stripe_user_id")
        if not stripe_user_id:
            return error("Failed to get Stripe account ID", 400)

        # Update workspace with Stripe connection
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(workspace_id)

        if not workspace:
            return error("Workspace not found", 404)

        # Store Stripe connection info in settings
        workspace.settings = {
            **workspace.settings,
            "stripe_account_id": stripe_user_id,
            "stripe_livemode": token_data.get("livemode", False),
            "stripe_connected": True,
        }

        workspace_repo.update_workspace(workspace)

        logger.info(
            "Stripe account connected",
            workspace_id=workspace_id,
            stripe_account_id=stripe_user_id,
        )

        return success({
            "connected": True,
            "stripe_account_id": stripe_user_id,
            "livemode": token_data.get("livemode", False),
        })

    except StripeError as e:
        logger.error("OAuth callback failed", error=e.message)
        return error(e.message, 400, error_code=e.code)


def get_connect_status(workspace_id: str) -> dict:
    """Get Stripe Connect status for workspace.

    Args:
        workspace_id: Workspace ID.

    Returns:
        Response with connection status.
    """
    workspace_repo = WorkspaceRepository()
    workspace = workspace_repo.get_by_id(workspace_id)

    if not workspace:
        return error("Workspace not found", 404)

    stripe_account_id = workspace.settings.get("stripe_account_id")

    if not stripe_account_id:
        return success({
            "connected": False,
            "message": "Stripe not connected",
        })

    try:
        # Get account details from Stripe
        account_status = get_account_status(stripe_account_id)

        return success({
            "connected": True,
            "stripe_account_id": stripe_account_id,
            "livemode": workspace.settings.get("stripe_livemode", False),
            "account": account_status,
        })

    except StripeError as e:
        logger.warning("Failed to get account status", error=e.message)
        return success({
            "connected": True,
            "stripe_account_id": stripe_account_id,
            "account": None,
            "error": e.message,
        })


def disconnect_account(workspace_id: str, event: dict) -> dict:
    """Disconnect Stripe account from workspace.

    Args:
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        Response confirming disconnection.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        request = DisconnectRequest.model_validate(body)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    except Exception:
        request = DisconnectRequest()

    if not request.confirm:
        return error("Confirmation required to disconnect", 400)

    workspace_repo = WorkspaceRepository()
    workspace = workspace_repo.get_by_id(workspace_id)

    if not workspace:
        return error("Workspace not found", 404)

    # Remove Stripe connection from settings
    old_account_id = workspace.settings.get("stripe_account_id")

    workspace.settings = {
        k: v for k, v in workspace.settings.items()
        if not k.startswith("stripe_")
    }

    workspace_repo.update_workspace(workspace)

    logger.info(
        "Stripe account disconnected",
        workspace_id=workspace_id,
        old_account_id=old_account_id,
    )

    return success({
        "disconnected": True,
        "message": "Stripe account has been disconnected",
    })
