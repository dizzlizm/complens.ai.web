"""Analytics API handler."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from complens.repositories.contact import ContactRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
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
        GET /workspaces/{workspace_id}/analytics?period=7d|30d|90d
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        if http_method == "GET":
            return get_analytics(workspace_id, event)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Analytics handler error", error=str(e))
        return error("Internal server error", 500)


def get_analytics(workspace_id: str, event: dict) -> dict:
    """Get analytics data for a workspace."""
    query_params = event.get("queryStringParameters", {}) or {}
    period = query_params.get("period", "30d")

    if period not in PERIODS:
        return error(f"Invalid period: {period}. Use 7d, 30d, or 90d", 400)

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
    except Exception:
        contacts = []

    # Get workflows
    try:
        workflows, _ = workflow_repo.list_by_workspace(workspace_id, limit=100)
    except Exception:
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

    # Workflow runs
    total_runs = 0
    successful_runs = 0
    failed_runs = 0
    workflow_runs_series = []
    workflow_performance = []

    for wf in workflows:
        try:
            runs = run_repo.list_by_workflow(wf.id, limit=500)
            wf_total = len(runs)
            wf_success = sum(1 for r in runs if _get_status(r) == "completed")
            wf_failed = sum(1 for r in runs if _get_status(r) == "failed")

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
        except Exception:
            pass

    # Sort performance by total runs descending
    workflow_performance.sort(key=lambda x: x["total"], reverse=True)
    top_workflows = workflow_performance[:5]

    # Build workflow runs time series
    all_runs = []
    for wf in workflows[:10]:  # Limit to top 10 workflows for performance
        try:
            runs = run_repo.list_by_workflow(wf.id, limit=200)
            all_runs.extend(runs)
        except Exception:
            pass

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

    return success({
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
    })


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
