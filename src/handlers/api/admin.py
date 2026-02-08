"""Admin API handler for super admin operations.

Provides platform-wide management capabilities for workspaces, users, billing, and system health.
All endpoints require super admin authentication.
"""

import json
from typing import Any

import structlog

from complens.repositories.workspace import WorkspaceRepository
from complens.services.admin_service import AdminService
from complens.utils.auth import get_auth_context, require_super_admin
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import error, forbidden, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle admin API requests.

    Routes:
        GET  /admin/workspaces - List all workspaces
        GET  /admin/workspaces/{id} - Get workspace details
        GET  /admin/workspaces/{id}/stats - Get workspace content stats
        PUT  /admin/workspaces/{id} - Update workspace
        GET  /admin/users - List Cognito users
        GET  /admin/users/{id} - Get user details
        GET  /admin/users/{id}/stats - Get user's aggregated stats
        POST /admin/users/{id}/disable - Disable user
        POST /admin/users/{id}/enable - Enable user
        GET  /admin/billing/summary - Get billing summary
        GET  /admin/system/health - Get system health
        GET  /admin/costs/metrics - Get AWS cost metrics
        GET  /admin/stats/platform - Get platform-wide stats
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}

        # Require super admin for all admin endpoints
        auth = get_auth_context(event)
        require_super_admin(auth)

        # Route requests
        if path == "/admin/workspaces" and http_method == "GET":
            return list_workspaces(event)
        elif "/admin/workspaces/" in path and path.endswith("/stats") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return get_workspace_stats(workspace_id)
        elif path.startswith("/admin/workspaces/") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return get_workspace(workspace_id)
        elif path.startswith("/admin/workspaces/") and http_method == "PUT":
            workspace_id = path_params.get("workspace_id")
            return update_workspace(workspace_id, event)
        elif path == "/admin/users" and http_method == "GET":
            return list_users(event)
        elif "/admin/users/" in path and path.endswith("/stats") and http_method == "GET":
            user_id = path_params.get("user_id")
            return get_user_stats(user_id)
        elif "/admin/users/" in path and path.endswith("/disable") and http_method == "POST":
            user_id = path_params.get("user_id")
            return disable_user(user_id)
        elif "/admin/users/" in path and path.endswith("/enable") and http_method == "POST":
            user_id = path_params.get("user_id")
            return enable_user(user_id)
        elif path.startswith("/admin/users/") and http_method == "GET":
            user_id = path_params.get("user_id")
            return get_user(user_id)
        elif path == "/admin/billing/summary" and http_method == "GET":
            return get_billing_summary()
        elif path == "/admin/system/health" and http_method == "GET":
            return get_system_health()
        elif path == "/admin/costs/usage" and http_method == "GET":
            return get_usage_metrics(event)
        elif path == "/admin/costs/actual" and http_method == "GET":
            return get_actual_costs(event)
        elif path == "/admin/stats/platform" and http_method == "GET":
            return get_platform_stats()
        else:
            return error("Not found", 404)

    except ForbiddenError as e:
        return forbidden(str(e))
    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Admin handler error", error=str(e))
        return error("Internal server error", 500)


def list_workspaces(event: dict) -> dict:
    """List all workspaces (paginated).

    Query params:
        limit: Max workspaces to return (default 50)
        cursor: Pagination cursor (base64 encoded last key)
    """
    query_params = event.get("queryStringParameters", {}) or {}
    limit = int(query_params.get("limit", 50))

    # Decode pagination cursor if provided
    cursor = query_params.get("cursor")
    last_key = None
    if cursor:
        import base64
        try:
            last_key = json.loads(base64.b64decode(cursor).decode("utf-8"))
        except Exception:
            pass

    ws_repo = WorkspaceRepository()
    workspaces, next_key = ws_repo.list_all(limit=limit, last_key=last_key)

    # Encode next cursor
    next_cursor = None
    if next_key:
        import base64
        next_cursor = base64.b64encode(json.dumps(next_key).encode("utf-8")).decode("utf-8")

    return success({
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "agency_id": ws.agency_id,
                "plan": getattr(ws, "plan", "free") or "free",
                "subscription_status": getattr(ws, "subscription_status", None),
                "created_at": ws.created_at.isoformat() if ws.created_at else None,
                "updated_at": ws.updated_at.isoformat() if ws.updated_at else None,
            }
            for ws in workspaces
        ],
        "next_cursor": next_cursor,
        "count": len(workspaces),
    })


def get_workspace(workspace_id: str) -> dict:
    """Get workspace details with integration status and billing info."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    # Get owner info from Cognito
    admin_service = AdminService()
    owner = None
    if workspace.agency_id:
        owner = admin_service.get_cognito_user(workspace.agency_id)

    # Extract trial and billing dates
    trial_ends_at = getattr(workspace, "trial_ends_at", None)
    plan_period_end = getattr(workspace, "plan_period_end", None)

    return success({
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "agency_id": workspace.agency_id,
            "plan": getattr(workspace, "plan", "free") or "free",
            "subscription_status": getattr(workspace, "subscription_status", None),
            "stripe_customer_id": getattr(workspace, "stripe_customer_id", None),
            "notification_email": getattr(workspace, "notification_email", None),
            "twilio_phone": getattr(workspace, "twilio_phone_number", None),
            "is_active": getattr(workspace, "is_active", True),
            "trial_ends_at": trial_ends_at.isoformat() if trial_ends_at else None,
            "plan_period_end": plan_period_end.isoformat() if plan_period_end else None,
            "has_twilio": bool(getattr(workspace, "twilio_phone_number", None)),
            "has_sendgrid": bool(getattr(workspace, "sendgrid_api_key_id", None)),
            "created_at": workspace.created_at.isoformat() if workspace.created_at else None,
            "updated_at": workspace.updated_at.isoformat() if workspace.updated_at else None,
        },
        "owner": owner,
    })


def update_workspace(workspace_id: str, event: dict) -> dict:
    """Update workspace (plan, status, etc.)."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    body = json.loads(event.get("body", "{}"))

    # Only allow updating certain fields via admin
    allowed_fields = ["plan", "subscription_status", "name"]
    for field in allowed_fields:
        if field in body:
            setattr(workspace, field, body[field])

    ws_repo.update_workspace(workspace, check_version=False)

    logger.info(
        "Workspace updated by admin",
        workspace_id=workspace_id,
        fields=list(body.keys()),
    )

    return success({
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "plan": getattr(workspace, "plan", "free") or "free",
            "subscription_status": getattr(workspace, "subscription_status", None),
            "updated_at": workspace.updated_at.isoformat() if workspace.updated_at else None,
        }
    })


def list_users(event: dict) -> dict:
    """List Cognito users (paginated).

    Query params:
        limit: Max users to return (default 50)
        cursor: Pagination token
        filter: Optional filter string
    """
    query_params = event.get("queryStringParameters", {}) or {}
    limit = int(query_params.get("limit", 50))
    cursor = query_params.get("cursor")
    filter_str = query_params.get("filter")

    admin_service = AdminService()
    users, next_token = admin_service.list_cognito_users(
        limit=limit,
        pagination_token=cursor,
        filter_str=filter_str,
    )

    return success({
        "users": users,
        "next_cursor": next_token,
        "count": len(users),
    })


def get_user(user_id: str) -> dict:
    """Get user details with their workspaces."""
    admin_service = AdminService()
    user = admin_service.get_cognito_user(user_id)

    if not user:
        return not_found("user", user_id)

    # Get user's workspaces
    ws_repo = WorkspaceRepository()
    agency_id = user.get("agency_id") or user.get("sub") or user_id
    workspaces = ws_repo.list_by_agency(agency_id)

    return success({
        "user": user,
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "plan": getattr(ws, "plan", "free") or "free",
            }
            for ws in workspaces
        ],
    })


def disable_user(user_id: str) -> dict:
    """Disable a Cognito user."""
    admin_service = AdminService()
    admin_service.disable_user(user_id)

    return success({"message": "User disabled", "user_id": user_id})


def enable_user(user_id: str) -> dict:
    """Enable a Cognito user."""
    admin_service = AdminService()
    admin_service.enable_user(user_id)

    return success({"message": "User enabled", "user_id": user_id})


def get_billing_summary() -> dict:
    """Get platform billing summary."""
    admin_service = AdminService()
    summary = admin_service.get_billing_summary()

    return success(summary)


def get_system_health() -> dict:
    """Get system health status."""
    admin_service = AdminService()
    health = admin_service.get_system_health()

    return success(health)


def get_workspace_stats(workspace_id: str) -> dict:
    """Get workspace content and engagement stats."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    admin_service = AdminService()
    stats = admin_service.get_workspace_stats(workspace_id)

    return success(stats)


def get_user_stats(user_id: str) -> dict:
    """Get user's aggregated stats across all workspaces."""
    admin_service = AdminService()

    # First verify user exists
    user = admin_service.get_cognito_user(user_id)
    if not user:
        return not_found("user", user_id)

    # Get the agency_id to use for workspace lookup
    agency_id = user.get("agency_id") or user.get("sub") or user_id
    stats = admin_service.get_user_stats(agency_id)

    return success(stats)


def get_usage_metrics(event: dict) -> dict:
    """Get AWS service usage metrics from CloudWatch.

    Query params:
        period: Time period - "1h", "24h", "7d", or "30d" (default: 24h)
    """
    query_params = event.get("queryStringParameters", {}) or {}
    period = query_params.get("period", "24h")

    # Validate period
    valid_periods = ["1h", "24h", "7d", "30d"]
    if period not in valid_periods:
        raise ValidationError([{"field": "period", "message": f"Must be one of: {', '.join(valid_periods)}"}])

    admin_service = AdminService()
    metrics = admin_service.get_usage_metrics(period)

    return success(metrics)


def get_actual_costs(event: dict) -> dict:
    """Get actual AWS costs from Cost Explorer.

    Note: Cost Explorer data has a ~24-48 hour delay.

    Query params:
        period: Time period - "1h", "24h", "7d", or "30d" (default: 24h)
    """
    query_params = event.get("queryStringParameters", {}) or {}
    period = query_params.get("period", "24h")

    # Validate period
    valid_periods = ["1h", "24h", "7d", "30d"]
    if period not in valid_periods:
        raise ValidationError([{"field": "period", "message": f"Must be one of: {', '.join(valid_periods)}"}])

    admin_service = AdminService()
    costs = admin_service.get_actual_costs(period)

    return success(costs)


def get_platform_stats() -> dict:
    """Get platform-wide aggregate statistics."""
    admin_service = AdminService()
    stats = admin_service.get_platform_stats()

    return success(stats)
