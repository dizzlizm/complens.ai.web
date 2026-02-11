"""Analytics API handler."""

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from complens.repositories.contact import ContactRepository
from complens.repositories.form import FormRepository
from complens.repositories.page import PageRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import error, not_found, success, validation_error

logger = structlog.get_logger()

# Period configurations
PERIODS = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle analytics API requests.

    Routes:
        GET /workspaces/{workspace_id}/analytics?period=7d|30d|90d&include=pages,forms
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)
        else:
            return error("workspace_id is required", 400)

        if http_method == "GET":
            return get_analytics(workspace_id, event)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Analytics handler error", error=str(e))
        return error("Internal server error", 500)


def get_analytics(workspace_id: str, event: dict) -> dict:
    """Get analytics data for a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}
    period = query_params.get("period", "30d")
    include = query_params.get("include", "")

    if period not in PERIODS:
        return error(f"Invalid period: {period}. Use 7d, 30d, or 90d", 400)

    include_sections = [s.strip() for s in include.split(",") if s.strip()]

    days = PERIODS[period]
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    contact_repo = ContactRepository()
    workflow_repo = WorkflowRepository()
    run_repo = WorkflowRunRepository()

    # Get contacts
    try:
        contacts, _ = contact_repo.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONTACT#",
            limit=1000,
        )
    except Exception as e:
        logger.error("Failed to query contacts for analytics", workspace_id=workspace_id, error=str(e))
        contacts = []

    # Get workflows
    try:
        workflows, _ = workflow_repo.list_by_workspace(workspace_id, limit=100)
    except Exception as e:
        logger.error("Failed to query workflows for analytics", workspace_id=workspace_id, error=str(e))
        workflows = []

    # Contact growth - bucket by day
    contact_growth = _bucket_by_day(contacts, days, start_date)

    # Total contacts
    total_contacts = len(contacts)
    contacts_in_period = sum(
        1 for c in contacts
        if hasattr(c, 'created_at') and c.created_at >= start_date
    )

    # Workflow stats
    total_workflows = len(workflows)
    active_workflows = sum(1 for w in workflows if _get_status(w) == "active")

    # Workflow stats from pre-computed counters (no per-workflow queries needed)
    total_runs = 0
    successful_runs = 0
    failed_runs = 0
    workflow_performance = []

    for wf in workflows:
        wf_total = getattr(wf, "total_runs", 0) or 0
        wf_success = getattr(wf, "successful_runs", 0) or 0
        wf_failed = getattr(wf, "failed_runs", 0) or 0

        total_runs += wf_total
        successful_runs += wf_success
        failed_runs += wf_failed

        if wf_total > 0:
            workflow_performance.append({
                "name": wf.name,
                "total": wf_total,
                "success": wf_success,
                "failed": wf_failed,
                "success_rate": round(wf_success / wf_total * 100) if wf_total > 0 else 0,
            })

    # Sort performance by total runs descending
    workflow_performance.sort(key=lambda x: x["total"], reverse=True)
    top_workflows = workflow_performance[:5]

    # Build workflow runs time series from top 5 workflows by total_runs
    all_runs = []
    sorted_wfs = sorted(workflows, key=lambda w: getattr(w, "total_runs", 0) or 0, reverse=True)
    for wf in sorted_wfs[:5]:
        try:
            runs = run_repo.list_by_workflow(wf.id, limit=200)
            all_runs.extend(runs)
        except Exception as e:
            logger.error("Failed to query runs for time series", workflow_id=wf.id, error=str(e))

    workflow_runs_by_day = _bucket_runs_by_day(all_runs, days, start_date)

    # Calculate trends
    mid_point = start_date + timedelta(days=days // 2)
    contacts_first_half = sum(
        1 for c in contacts
        if hasattr(c, 'created_at') and start_date <= c.created_at < mid_point
    )
    contacts_second_half = sum(
        1 for c in contacts
        if hasattr(c, 'created_at') and c.created_at >= mid_point
    )
    contact_trend = _calc_trend(contacts_first_half, contacts_second_half)

    result = {
        "period": period,
        "summary": {
            "total_contacts": total_contacts,
            "contacts_in_period": contacts_in_period,
            "contact_trend": contact_trend,
            "total_workflows": total_workflows,
            "active_workflows": active_workflows,
            "total_runs": total_runs,
            "successful_runs": successful_runs,
            "failed_runs": failed_runs,
            "success_rate": round(successful_runs / total_runs * 100) if total_runs > 0 else 0,
        },
        "contact_growth": contact_growth,
        "workflow_runs": workflow_runs_by_day,
        "top_workflows": top_workflows,
    }

    # Page analytics
    if "pages" in include_sections:
        result["page_analytics"] = _get_page_analytics(workspace_id)

    # Form analytics
    if "forms" in include_sections:
        result["form_analytics"] = _get_form_analytics(workspace_id)

    # Recent activity
    if "activity" in include_sections:
        result["recent_activity"] = _get_recent_activity(workspace_id, all_runs, contacts)

    return success(result)


def _get_page_analytics(workspace_id: str) -> dict:
    """Get page performance analytics.

    Args:
        workspace_id: Workspace ID.

    Returns:
        Page analytics data.
    """
    page_repo = PageRepository()

    try:
        pages, _ = page_repo.list_by_workspace(workspace_id, limit=100)
    except Exception:
        pages = []

    total_views = 0
    total_submissions = 0
    total_chats = 0
    top_pages = []

    for page in pages:
        views = getattr(page, "view_count", 0) or 0
        submissions = getattr(page, "form_submission_count", 0) or 0
        chats = getattr(page, "chat_session_count", 0) or 0

        total_views += views
        total_submissions += submissions
        total_chats += chats

        if views > 0 or submissions > 0 or chats > 0:
            conversion = round(submissions / views * 100, 1) if views > 0 else 0.0
            top_pages.append({
                "id": page.id,
                "name": page.name,
                "slug": page.slug,
                "views": views,
                "submissions": submissions,
                "chats": chats,
                "conversion_rate": conversion,
            })

    # Sort by views descending
    top_pages.sort(key=lambda x: x["views"], reverse=True)
    top_pages = top_pages[:10]

    overall_conversion = round(total_submissions / total_views * 100, 1) if total_views > 0 else 0.0

    return {
        "total_page_views": total_views,
        "total_form_submissions": total_submissions,
        "total_chat_sessions": total_chats,
        "overall_conversion_rate": overall_conversion,
        "top_pages": top_pages,
    }


def _get_form_analytics(workspace_id: str) -> dict:
    """Get form performance analytics.

    Args:
        workspace_id: Workspace ID.

    Returns:
        Form analytics data.
    """
    page_repo = PageRepository()
    form_repo = FormRepository()

    try:
        pages, _ = page_repo.list_by_workspace(workspace_id, limit=100)
    except Exception:
        pages = []

    page_name_map = {p.id: p.name for p in pages}

    # Single query for all forms in workspace (1 query instead of N per-page queries)
    try:
        forms, _ = form_repo.list_by_workspace(workspace_id, limit=500)
    except Exception:
        forms = []

    total_submissions = 0
    top_forms = []

    for form in forms:
        submissions = getattr(form, "submission_count", 0) or 0
        total_submissions += submissions

        if submissions > 0:
            page_id = getattr(form, "page_id", None)
            top_forms.append({
                "id": form.id,
                "name": form.name,
                "page_name": page_name_map.get(page_id, "Unknown") if page_id else "Unknown",
                "submissions": submissions,
            })

    # Sort by submissions descending
    top_forms.sort(key=lambda x: x["submissions"], reverse=True)
    top_forms = top_forms[:10]

    return {
        "total_submissions": total_submissions,
        "top_forms": top_forms,
    }


def _get_status(entity) -> str:
    """Get status value from entity, handling both enum and string."""
    status = entity.status
    return status.value if hasattr(status, 'value') else str(status)


def _bucket_by_day(items: list, days: int, start_date: datetime) -> list[dict]:
    """Bucket items by day based on created_at."""
    buckets: dict[str, int] = {}
    now = datetime.now(timezone.utc)

    for i in range(days):
        day = start_date + timedelta(days=i)
        if day <= now:
            buckets[day.strftime("%Y-%m-%d")] = 0

    for item in items:
        if hasattr(item, 'created_at') and item.created_at >= start_date:
            day_key = item.created_at.strftime("%Y-%m-%d")
            if day_key in buckets:
                buckets[day_key] += 1

    return [{"date": k, "count": v} for k, v in sorted(buckets.items())]


def _bucket_runs_by_day(runs: list, days: int, start_date: datetime) -> list[dict]:
    """Bucket workflow runs by day with success/failure counts."""
    buckets: dict[str, dict] = {}
    now = datetime.now(timezone.utc)

    for i in range(days):
        day = start_date + timedelta(days=i)
        if day <= now:
            buckets[day.strftime("%Y-%m-%d")] = {"success": 0, "failed": 0}

    for run in runs:
        if hasattr(run, 'created_at') and run.created_at >= start_date:
            day_key = run.created_at.strftime("%Y-%m-%d")
            if day_key in buckets:
                status = _get_status(run)
                if status == "completed":
                    buckets[day_key]["success"] += 1
                elif status == "failed":
                    buckets[day_key]["failed"] += 1

    return [
        {"date": k, "success": v["success"], "failed": v["failed"]}
        for k, v in sorted(buckets.items())
    ]


def _calc_trend(first_half: int, second_half: int) -> float:
    """Calculate percentage trend between two periods."""
    if first_half == 0:
        return 100.0 if second_half > 0 else 0.0
    return round(((second_half - first_half) / first_half) * 100, 1)


def _get_recent_activity(workspace_id: str, runs: list, contacts: list) -> list[dict]:
    """Get recent activity feed for the dashboard.

    Combines workflow runs and new contacts into a unified activity feed.

    Args:
        workspace_id: Workspace ID.
        runs: List of workflow runs.
        contacts: List of contacts.

    Returns:
        List of recent activity items, sorted by timestamp descending.
    """
    activities = []

    # Add workflow runs to activity feed
    for run in runs[:50]:  # Limit to last 50
        status = _get_status(run)
        status_map = {
            "completed": "success",
            "failed": "failed",
            "running": "running",
            "pending": "running",
        }

        wf_name = getattr(run, "workflow_name", None) or "Workflow"
        created_at = getattr(run, "created_at", None)
        if created_at:
            activities.append({
                "id": f"run_{run.id}",
                "type": "workflow_run",
                "title": wf_name,
                "description": f"Workflow {status}",
                "status": status_map.get(status, "running"),
                "timestamp": created_at.isoformat(),
                "link": f"/workflows/{getattr(run, 'workflow_id', '')}",
            })

    # Add recent contacts
    for contact in contacts[:20]:  # Limit to last 20
        created_at = getattr(contact, "created_at", None)
        if created_at:
            email = getattr(contact, "email", "") or "Unknown"
            first_name = getattr(contact, "first_name", "") or ""
            display_name = f"{first_name} ({email})" if first_name else email

            activities.append({
                "id": f"contact_{contact.id}",
                "type": "contact_created",
                "title": "New contact",
                "description": display_name,
                "timestamp": created_at.isoformat(),
                "link": f"/contacts/{contact.id}",
            })

    # Sort by timestamp descending and limit to 10 most recent
    activities.sort(key=lambda x: x["timestamp"], reverse=True)
    return activities[:10]
