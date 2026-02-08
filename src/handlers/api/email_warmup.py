"""Email warm-up API handler."""

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.warmup_domain import StartWarmupRequest, UpdateSeedListRequest, WarmupStatusResponse
from complens.repositories.warmup_domain import WarmupDomainRepository
from complens.services.email_service import EmailService
from complens.services.feature_gate import FeatureGateError, get_workspace_plan, require_feature
from complens.services.warmup_service import WarmupService
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ConflictError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle email warm-up API requests.

    Routes:
        GET    /workspaces/{ws}/email-warmup                    List warm-up domains
        POST   /workspaces/{ws}/email-warmup                    Start warm-up
        GET    /workspaces/{ws}/email-warmup/check-domain       Check domain auth
        GET    /workspaces/{ws}/email-warmup/{domain}           Get status
        POST   /workspaces/{ws}/email-warmup/{domain}/pause     Pause
        POST   /workspaces/{ws}/email-warmup/{domain}/resume    Resume
        DELETE /workspaces/{ws}/email-warmup/{domain}           Cancel
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        domain = path_params.get("domain")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = WarmupDomainRepository()
        service = WarmupService(repo=repo)

        if path.endswith("/check-domain") and http_method == "GET":
            return check_domain_auth(event)
        elif path.endswith("/seed-list") and http_method == "PUT" and domain:
            return update_seed_list(service, workspace_id, domain, event)
        elif path.endswith("/warmup-log") and http_method == "GET" and domain:
            return get_warmup_log(repo, workspace_id, domain)
        elif path.endswith("/pause") and http_method == "POST" and domain:
            return pause_warmup(service, workspace_id, domain)
        elif path.endswith("/resume") and http_method == "POST" and domain:
            return resume_warmup(service, workspace_id, domain)
        elif http_method == "GET" and domain:
            return get_warmup_status(service, workspace_id, domain)
        elif http_method == "DELETE" and domain:
            return cancel_warmup(service, workspace_id, domain)
        elif http_method == "GET" and not domain:
            return list_warmups(repo, workspace_id)
        elif http_method == "POST" and not domain:
            return start_warmup(service, workspace_id, event)
        else:
            return error("Method not allowed", 405)

    except FeatureGateError as e:
        return error(str(e), 403, error_code="PLAN_LIMIT_REACHED")
    except PydanticValidationError as e:
        return validation_error(e.errors())
    except ValidationError as e:
        return validation_error(e.errors)
    except ConflictError as e:
        return error(str(e), 409, error_code="CONFLICT")
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Email warmup handler error", error=str(e))
        return error("Internal server error", 500)


def list_warmups(repo: WarmupDomainRepository, workspace_id: str) -> dict:
    """List all warm-up domains for a workspace.

    Args:
        repo: WarmupDomainRepository.
        workspace_id: Workspace ID.

    Returns:
        API response with warmup list.
    """
    warmups, _ = repo.list_by_workspace(workspace_id, limit=100)

    return success({
        "items": [
            WarmupStatusResponse.from_warmup_domain(w).model_dump(mode="json")
            for w in warmups
        ],
    })


def start_warmup(service: WarmupService, workspace_id: str, event: dict) -> dict:
    """Start a warm-up for a domain.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with created warmup.
    """
    plan = get_workspace_plan(workspace_id)
    require_feature(plan, "email_warmup")

    body = json.loads(event.get("body", "{}"))
    request = StartWarmupRequest.model_validate(body)

    warmup = service.start_warmup(
        workspace_id=workspace_id,
        domain=request.domain,
        schedule=request.schedule,
        max_bounce_rate=request.max_bounce_rate,
        max_complaint_rate=request.max_complaint_rate,
        send_window_start=request.send_window_start,
        send_window_end=request.send_window_end,
        seed_list=request.seed_list,
        auto_warmup_enabled=request.auto_warmup_enabled,
        from_name=request.from_name,
    )

    logger.info(
        "Warmup started via API",
        workspace_id=workspace_id,
        domain=request.domain,
    )

    return created(
        WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    )


def get_warmup_status(service: WarmupService, workspace_id: str, domain: str) -> dict:
    """Get warm-up status for a domain.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response with warmup status.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    today_counter = service.repo.get_daily_counter(
        domain,
        datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )

    result = WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    if today_counter:
        result["today"] = today_counter

    return success(result)


def pause_warmup(service: WarmupService, workspace_id: str, domain: str) -> dict:
    """Pause a warm-up.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response with updated warmup.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    warmup = service.pause_warmup(domain, reason="manual")

    return success(
        WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    )


def resume_warmup(service: WarmupService, workspace_id: str, domain: str) -> dict:
    """Resume a paused warm-up.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response with updated warmup.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    warmup = service.resume_warmup(domain)

    return success(
        WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    )


def cancel_warmup(service: WarmupService, workspace_id: str, domain: str) -> dict:
    """Cancel and delete a warm-up.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response confirming deletion.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    service.cancel_warmup(domain)

    return success({"deleted": True})


def update_seed_list(
    service: WarmupService, workspace_id: str, domain: str, event: dict,
) -> dict:
    """Update seed list and auto-warmup configuration.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.
        event: API Gateway event.

    Returns:
        API response with updated warmup.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    body = json.loads(event.get("body", "{}"))
    request = UpdateSeedListRequest.model_validate(body)

    warmup.seed_list = request.seed_list
    warmup.auto_warmup_enabled = request.auto_warmup_enabled
    warmup.from_name = request.from_name
    warmup = service.repo.update_warmup(warmup)

    logger.info(
        "Seed list updated",
        domain=domain,
        seed_count=len(request.seed_list),
        auto_warmup=request.auto_warmup_enabled,
    )

    return success(
        WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    )


def get_warmup_log(
    repo: WarmupDomainRepository, workspace_id: str, domain: str,
) -> dict:
    """Get recent warmup emails sent for a domain.

    Args:
        repo: WarmupDomainRepository.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response with warmup email log.
    """
    warmup = repo.get_by_domain(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    emails = repo.get_recent_warmup_emails(domain, today, limit=50)

    return success({"items": emails})


def check_domain_auth(event: dict) -> dict:
    """Check domain authentication status (verification + DKIM).

    Args:
        event: API Gateway event.

    Returns:
        API response with domain auth status.
    """
    query_params = event.get("queryStringParameters", {}) or {}
    domain = query_params.get("domain")

    if not domain:
        return error("Missing 'domain' query parameter", 400)

    email_service = EmailService()
    auth_status = email_service.check_domain_auth(domain)

    return success(auth_status)
