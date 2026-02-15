"""Admin API handler for super admin operations.

Provides platform-wide management capabilities for workspaces, users, billing, and system health.
All endpoints require super admin authentication.
"""

import json
from typing import Any

import structlog

from complens.repositories.contact import ContactRepository
from complens.repositories.form import FormRepository
from complens.repositories.page import PageRepository
from complens.repositories.workflow import WorkflowRepository
from complens.repositories.workspace import WorkspaceRepository
from complens.services.admin_service import AdminService
from complens.utils.auth import get_auth_context, require_super_admin
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import error, forbidden, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle admin API requests.

    Routes:
        GET    /admin/workspaces - List all workspaces
        GET    /admin/workspaces/{id} - Get workspace details
        GET    /admin/workspaces/{id}/stats - Get workspace content stats
        PUT    /admin/workspaces/{id} - Update workspace
        DELETE /admin/workspaces/{id} - Delete workspace and all data
        GET    /admin/workspaces/{id}/members - List workspace members
        POST   /admin/workspaces/{id}/members - Add member to workspace
        PUT    /admin/workspaces/{id}/members/{user_id} - Update member role
        DELETE /admin/workspaces/{id}/members/{user_id} - Remove member
        GET    /admin/workspaces/{id}/pages - List workspace pages
        DELETE /admin/workspaces/{id}/pages/{page_id} - Delete page
        GET    /admin/workspaces/{id}/contacts - List workspace contacts
        DELETE /admin/workspaces/{id}/contacts/{contact_id} - Delete contact
        GET    /admin/workspaces/{id}/workflows - List workspace workflows
        DELETE /admin/workspaces/{id}/workflows/{workflow_id} - Delete workflow
        GET    /admin/workspaces/{id}/forms - List workspace forms
        DELETE /admin/workspaces/{id}/forms/{form_id} - Delete form
        GET    /admin/users - List Cognito users
        GET    /admin/users/{id} - Get user details
        GET    /admin/users/{id}/stats - Get user's aggregated stats
        POST   /admin/users/{id}/disable - Disable user
        POST   /admin/users/{id}/enable - Enable user
        DELETE /admin/users/{id} - Delete user
        POST   /admin/users/{id}/toggle-super-admin - Toggle super admin
        GET    /admin/billing/summary - Get billing summary
        GET    /admin/system/health - Get system health
        GET    /admin/costs/metrics - Get AWS cost metrics
        GET    /admin/stats/platform - Get platform-wide stats
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}

        # Require super admin for all admin endpoints
        auth = get_auth_context(event)
        require_super_admin(auth)

        # Route requests
        # Workspace routes
        if path == "/admin/workspaces" and http_method == "GET":
            return list_workspaces(event)
        elif "/admin/workspaces/" in path and path.endswith("/stats") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return get_workspace_stats(workspace_id)
        elif "/admin/workspaces/" in path and "/members/" in path and http_method == "PUT":
            workspace_id = path_params.get("workspace_id")
            user_id = path_params.get("user_id")
            return update_workspace_member(workspace_id, user_id, event)
        elif "/admin/workspaces/" in path and "/members/" in path and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            user_id = path_params.get("user_id")
            return remove_workspace_member(workspace_id, user_id)
        elif "/admin/workspaces/" in path and path.endswith("/members") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return list_workspace_members(workspace_id)
        elif "/admin/workspaces/" in path and path.endswith("/members") and http_method == "POST":
            workspace_id = path_params.get("workspace_id")
            return add_workspace_member(workspace_id, event)
        # Workspace content routes (must be before generic workspace GET/PUT/DELETE)
        elif "/admin/workspaces/" in path and path.endswith("/pages") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return list_workspace_pages(workspace_id)
        elif "/admin/workspaces/" in path and "/pages/" in path and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            page_id = path_params.get("page_id")
            return delete_workspace_page(workspace_id, page_id)
        elif "/admin/workspaces/" in path and path.endswith("/contacts") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return list_workspace_contacts(workspace_id, event)
        elif "/admin/workspaces/" in path and "/contacts/" in path and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            contact_id = path_params.get("contact_id")
            return delete_workspace_contact(workspace_id, contact_id)
        elif "/admin/workspaces/" in path and path.endswith("/workflows") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return list_workspace_workflows(workspace_id)
        elif "/admin/workspaces/" in path and "/workflows/" in path and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            workflow_id = path_params.get("workflow_id")
            return delete_workspace_workflow(workspace_id, workflow_id)
        elif "/admin/workspaces/" in path and path.endswith("/forms") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return list_workspace_forms(workspace_id)
        elif "/admin/workspaces/" in path and "/forms/" in path and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            form_id = path_params.get("form_id")
            return delete_workspace_form(workspace_id, form_id)
        elif path.startswith("/admin/workspaces/") and http_method == "GET":
            workspace_id = path_params.get("workspace_id")
            return get_workspace(workspace_id)
        elif path.startswith("/admin/workspaces/") and http_method == "PUT":
            workspace_id = path_params.get("workspace_id")
            return update_workspace(workspace_id, event)
        elif path.startswith("/admin/workspaces/") and http_method == "DELETE":
            workspace_id = path_params.get("workspace_id")
            return delete_workspace(workspace_id)

        # User routes
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
        elif "/admin/users/" in path and path.endswith("/toggle-super-admin") and http_method == "POST":
            user_id = path_params.get("user_id")
            return toggle_super_admin(user_id)
        elif path.startswith("/admin/users/") and http_method == "GET":
            user_id = path_params.get("user_id")
            return get_user(user_id)
        elif path.startswith("/admin/users/") and http_method == "DELETE":
            user_id = path_params.get("user_id")
            return delete_user(user_id)

        # Other routes
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
        elif path == "/admin/plans" and http_method == "GET":
            return list_plans()
        elif path.startswith("/admin/plans/") and http_method == "PUT":
            plan_key = path_params.get("plan_key")
            return update_plan(plan_key, event)
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


def list_plans() -> dict:
    """List all plan configurations."""
    from complens.repositories.plan_config import PlanConfigRepository
    from complens.services.billing_service import DEFAULT_PLAN_LIMITS

    repo = PlanConfigRepository()
    plans = repo.list_plans()

    if not plans:
        plans = repo.seed_defaults(DEFAULT_PLAN_LIMITS)

    return success({
        "plans": [p.model_dump(mode="json") for p in plans],
    })


def delete_workspace(workspace_id: str) -> dict:
    """Delete a workspace and all associated data."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    admin_service = AdminService()
    result = admin_service.delete_workspace_data(workspace_id, workspace.agency_id)

    logger.info("Workspace deleted by admin", workspace_id=workspace_id)

    return success({
        "message": "Workspace deleted",
        "workspace_id": workspace_id,
        "deleted_items": result["deleted_items"],
    })


def delete_user(user_id: str) -> dict:
    """Delete a Cognito user and clean up all associated data."""
    admin_service = AdminService()
    user = admin_service.get_cognito_user(user_id)

    if not user:
        return not_found("user", user_id)

    result = admin_service.delete_user(user_id)

    return success({
        "message": "User deleted",
        "user_id": user_id,
        "deleted_workspaces": result["deleted_workspaces"],
        "removed_from_workspaces": result["removed_from_workspaces"],
    })


def list_workspace_members(workspace_id: str) -> dict:
    """List team members and pending invitations for a workspace."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    admin_service = AdminService()
    result = admin_service.list_workspace_members(workspace_id)

    return success(result)


def add_workspace_member(workspace_id: str, event: dict) -> dict:
    """Add a user to a workspace."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)

    if not workspace:
        return not_found("workspace", workspace_id)

    body = json.loads(event.get("body", "{}"))
    user_id = body.get("user_id")
    role = body.get("role", "member")

    if not user_id:
        return validation_error([{"field": "user_id", "message": "user_id is required"}])

    if role not in ("owner", "admin", "member"):
        return validation_error([{"field": "role", "message": "role must be owner, admin, or member"}])

    admin_service = AdminService()
    result = admin_service.add_member_to_workspace(workspace_id, user_id, role)

    return success(result)


def update_workspace_member(workspace_id: str, user_id: str, event: dict) -> dict:
    """Update a workspace member's role."""
    body = json.loads(event.get("body", "{}"))
    role = body.get("role")

    if not role or role not in ("owner", "admin", "member"):
        return validation_error([{"field": "role", "message": "role must be owner, admin, or member"}])

    admin_service = AdminService()
    result = admin_service.update_member_role(workspace_id, user_id, role)

    if not result:
        return not_found("member", user_id)

    return success(result)


def remove_workspace_member(workspace_id: str, user_id: str) -> dict:
    """Remove a member from a workspace."""
    admin_service = AdminService()
    admin_service.remove_member_from_workspace(workspace_id, user_id)

    return success({
        "message": "Member removed",
        "workspace_id": workspace_id,
        "user_id": user_id,
    })


def toggle_super_admin(user_id: str) -> dict:
    """Toggle super admin status for a user."""
    admin_service = AdminService()
    user = admin_service.get_cognito_user(user_id)

    if not user:
        return not_found("user", user_id)

    result = admin_service.toggle_super_admin(user_id)

    return success(result)


def update_plan(plan_key: str, event: dict) -> dict:
    """Update a plan configuration."""
    from complens.repositories.plan_config import PlanConfigRepository
    from complens.services.billing_service import invalidate_plan_cache

    if not plan_key:
        return error("plan_key is required", 400)

    repo = PlanConfigRepository()
    existing = repo.get_plan(plan_key)

    if not existing:
        return not_found("plan", plan_key)

    body = json.loads(event.get("body", "{}"))

    # Update allowed fields
    allowed_fields = [
        "display_name", "price_monthly", "stripe_price_id", "description",
        "limits", "features", "feature_list", "highlighted", "sort_order",
    ]
    for field in allowed_fields:
        if field in body:
            setattr(existing, field, body[field])

    repo.upsert_plan(existing)
    invalidate_plan_cache()

    logger.info("Plan config updated by admin", plan_key=plan_key, fields=list(body.keys()))

    return success(existing.model_dump(mode="json"))


# -------------------------------------------------------------------------
# Workspace content CRUD (pages, contacts, workflows, forms)
# -------------------------------------------------------------------------


def _validate_workspace(workspace_id: str) -> None:
    """Verify workspace exists; raises NotFoundError if not."""
    ws_repo = WorkspaceRepository()
    workspace = ws_repo.get_by_id(workspace_id)
    if not workspace:
        raise NotFoundError("workspace", workspace_id)


def list_workspace_pages(workspace_id: str) -> dict:
    """List all pages in a workspace."""
    _validate_workspace(workspace_id)
    repo = PageRepository()
    pages, _ = repo.list_by_workspace(workspace_id, limit=200)

    return success({
        "items": [
            {
                "id": p.id,
                "title": p.title or "",
                "slug": p.slug or "",
                "status": getattr(p, "status", "draft"),
                "subdomain": getattr(p, "subdomain", None),
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in pages
        ],
        "count": len(pages),
    })


def delete_workspace_page(workspace_id: str, page_id: str) -> dict:
    """Delete a page from a workspace."""
    _validate_workspace(workspace_id)
    repo = PageRepository()
    deleted = repo.delete_page(workspace_id, page_id)
    if not deleted:
        return not_found("page", page_id)

    logger.info("Page deleted by admin", workspace_id=workspace_id, page_id=page_id)
    return success({"message": "Page deleted", "page_id": page_id})


def list_workspace_contacts(workspace_id: str, event: dict) -> dict:
    """List contacts in a workspace."""
    _validate_workspace(workspace_id)
    query_params = event.get("queryStringParameters", {}) or {}
    limit = int(query_params.get("limit", 100))

    repo = ContactRepository()
    contacts, _ = repo.list_by_workspace(workspace_id, limit=limit)

    return success({
        "items": [
            {
                "id": c.id,
                "email": c.email or "",
                "first_name": getattr(c, "first_name", ""),
                "last_name": getattr(c, "last_name", ""),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in contacts
        ],
        "count": len(contacts),
    })


def delete_workspace_contact(workspace_id: str, contact_id: str) -> dict:
    """Delete a contact from a workspace."""
    _validate_workspace(workspace_id)
    repo = ContactRepository()
    deleted = repo.delete_contact(workspace_id, contact_id)
    if not deleted:
        return not_found("contact", contact_id)

    logger.info("Contact deleted by admin", workspace_id=workspace_id, contact_id=contact_id)
    return success({"message": "Contact deleted", "contact_id": contact_id})


def list_workspace_workflows(workspace_id: str) -> dict:
    """List workflows in a workspace."""
    _validate_workspace(workspace_id)
    repo = WorkflowRepository()
    workflows, _ = repo.list_by_workspace(workspace_id, limit=200)

    return success({
        "items": [
            {
                "id": w.id,
                "name": w.name or "",
                "status": getattr(w, "status", "draft"),
                "trigger_type": getattr(w, "trigger_type", None),
                "created_at": w.created_at.isoformat() if w.created_at else None,
            }
            for w in workflows
        ],
        "count": len(workflows),
    })


def delete_workspace_workflow(workspace_id: str, workflow_id: str) -> dict:
    """Delete a workflow from a workspace."""
    _validate_workspace(workspace_id)
    repo = WorkflowRepository()
    deleted = repo.delete_workflow(workspace_id, workflow_id)
    if not deleted:
        return not_found("workflow", workflow_id)

    logger.info("Workflow deleted by admin", workspace_id=workspace_id, workflow_id=workflow_id)
    return success({"message": "Workflow deleted", "workflow_id": workflow_id})


def list_workspace_forms(workspace_id: str) -> dict:
    """List all forms in a workspace."""
    _validate_workspace(workspace_id)
    repo = FormRepository()
    forms, _ = repo.list_by_workspace(workspace_id, limit=200)

    return success({
        "items": [
            {
                "id": f.id,
                "name": getattr(f, "name", ""),
                "page_id": getattr(f, "page_id", None),
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in forms
        ],
        "count": len(forms),
    })


def delete_workspace_form(workspace_id: str, form_id: str) -> dict:
    """Delete a form from a workspace."""
    _validate_workspace(workspace_id)
    repo = FormRepository()
    deleted = repo.delete_form(workspace_id, form_id)
    if not deleted:
        return not_found("form", form_id)

    logger.info("Form deleted by admin", workspace_id=workspace_id, form_id=form_id)
    return success({"message": "Form deleted", "form_id": form_id})
