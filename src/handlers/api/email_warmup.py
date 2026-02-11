"""Email warm-up API handler."""

import json
import os
from datetime import datetime, timezone
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.warmup_domain import DomainHealthResponse, StartWarmupRequest, UpdateSeedListRequest, UpdateWarmupSettingsRequest, WarmupStatusResponse
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

        if path.endswith("/setup-domain") and http_method == "POST":
            return setup_domain_handler(event, workspace_id)
        elif "/domains/" in path and http_method == "DELETE":
            # DELETE /email-warmup/domains/{domain}
            domain_segment = path.split("/domains/")[-1].rstrip("/")
            return delete_domain_handler(workspace_id, domain_segment)
        elif path.endswith("/domains") and http_method == "GET" and not domain:
            return list_domains_handler(workspace_id)
        elif path.endswith("/check-domain") and http_method == "GET":
            return check_domain_auth(event)
        elif path.endswith("/domain-health") and http_method == "GET" and domain:
            return get_domain_health(service, workspace_id, domain)
        elif path.endswith("/seed-list") and http_method == "PUT" and domain:
            return update_seed_list(service, workspace_id, domain, event)
        elif path.endswith("/settings") and http_method == "PUT" and domain:
            return update_warmup_settings(service, workspace_id, domain, event)
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
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    items = []
    for w in warmups:
        item = WarmupStatusResponse.from_warmup_domain(w).model_dump(mode="json")
        if w.status in ("active", "paused"):
            counter = repo.get_daily_counter(w.domain, today)
            if counter:
                item["today"] = counter
        items.append(item)

    return success({"items": items})


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


def update_warmup_settings(
    service: WarmupService, workspace_id: str, domain: str, event: dict,
) -> dict:
    """Update warmup settings (send window, thresholds, remaining schedule).

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
    request = UpdateWarmupSettingsRequest.model_validate(body)

    if request.send_window_start is not None:
        warmup.send_window_start = request.send_window_start
    if request.send_window_end is not None:
        warmup.send_window_end = request.send_window_end
    if request.max_bounce_rate is not None:
        warmup.max_bounce_rate = request.max_bounce_rate
    if request.max_complaint_rate is not None:
        warmup.max_complaint_rate = request.max_complaint_rate
    if request.schedule is not None:
        # Splice new values from warmup_day onward
        warmup.schedule = warmup.schedule[:warmup.warmup_day] + request.schedule

    warmup = service.repo.update_warmup(warmup)

    logger.info(
        "Warmup settings updated",
        domain=domain,
        workspace_id=workspace_id,
    )

    return success(
        WarmupStatusResponse.from_warmup_domain(warmup).model_dump(mode="json")
    )


def delete_domain_handler(workspace_id: str, domain: str) -> dict:
    """Delete a saved domain setup record.

    Args:
        workspace_id: Workspace ID.
        domain: The domain to delete.

    Returns:
        API response confirming deletion.
    """
    _delete_saved_domain(workspace_id, domain)
    logger.info("Domain deleted", workspace_id=workspace_id, domain=domain)
    return success({"deleted": True})


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


def _auto_set_from_email(workspace_id: str, domain: str) -> None:
    """Auto-populate workspace from_email with noreply@domain if not already set.

    Args:
        workspace_id: Workspace ID.
        domain: The newly registered domain.
    """
    try:
        from complens.repositories.workspace import WorkspaceRepository
        ws_repo = WorkspaceRepository()
        workspace = ws_repo.get_by_id(workspace_id)
        if workspace and not workspace.from_email:
            workspace.from_email = f"noreply@{domain}"
            ws_repo.update_workspace(workspace, check_version=False)
            logger.info(
                "Auto-set workspace from_email",
                workspace_id=workspace_id,
                from_email=f"noreply@{domain}",
            )
    except Exception:
        logger.warning(
            "Failed to auto-set from_email",
            workspace_id=workspace_id,
            domain=domain,
            exc_info=True,
        )


def _auto_create_site(workspace_id: str, domain: str):
    """Auto-create a Site for this domain if one doesn't exist.

    Also assigns any orphan pages (pages with no site_id) to the new site.

    Args:
        workspace_id: Workspace ID.
        domain: The newly verified domain.

    Returns:
        The Site (existing or newly created), or None on error.
    """
    try:
        from complens.models.site import Site
        from complens.repositories.site import SiteRepository
        from complens.repositories.page import PageRepository

        site_repo = SiteRepository()
        existing = site_repo.get_by_domain(workspace_id, domain)
        if existing:
            return existing

        # Generate display name from domain (e.g., "itsross.com" -> "Itsross")
        name = domain.split('.')[0].capitalize()

        site = Site(
            workspace_id=workspace_id,
            domain_name=domain,
            name=name,
        )
        site_repo.create_site(site)
        logger.info(
            "Auto-created site for domain",
            workspace_id=workspace_id,
            domain=domain,
            site_id=site.id,
        )

        # Assign orphan pages (no site_id) to the new site
        page_repo = PageRepository()
        pages, _ = page_repo.list_by_workspace(workspace_id)
        for page in pages:
            if not page.site_id:
                page.site_id = site.id
                page_repo.update_page(page)
                logger.info(
                    "Assigned orphan page to site",
                    page_id=page.id,
                    site_id=site.id,
                )

        return site
    except Exception:
        logger.warning(
            "Failed to auto-create site",
            workspace_id=workspace_id,
            domain=domain,
            exc_info=True,
        )
        return None


def _get_table():
    """Get DynamoDB table resource."""
    return boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def _save_domain_setup(workspace_id: str, domain: str, setup_result: dict) -> None:
    """Persist domain setup to DynamoDB.

    Args:
        workspace_id: Workspace ID.
        domain: The domain name.
        setup_result: Result from EmailService.setup_domain().
    """
    table = _get_table()
    table.put_item(Item={
        "PK": f"WS#{workspace_id}#DOMAINS",
        "SK": f"DOMAIN#{domain}",
        "workspace_id": workspace_id,
        "domain": domain,
        "verification_token": setup_result["verification_token"],
        "dkim_tokens": setup_result["dkim_tokens"],
        "dns_records": setup_result["dns_records"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


def _list_saved_domains(workspace_id: str) -> list[dict]:
    """List all configured domains for a workspace from DynamoDB.

    Args:
        workspace_id: Workspace ID.

    Returns:
        List of saved domain records.
    """
    table = _get_table()
    response = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={
            ":pk": f"WS#{workspace_id}#DOMAINS",
            ":sk": "DOMAIN#",
        },
    )
    return response.get("Items", [])


def _delete_saved_domain(workspace_id: str, domain: str) -> None:
    """Delete a saved domain setup record.

    Args:
        workspace_id: Workspace ID.
        domain: The domain name to remove.
    """
    table = _get_table()
    table.delete_item(Key={
        "PK": f"WS#{workspace_id}#DOMAINS",
        "SK": f"DOMAIN#{domain}",
    })


def setup_domain_handler(event: dict, workspace_id: str) -> dict:
    """Set up a domain for SES sending (verify identity + DKIM).

    Persists the domain setup to DynamoDB so it survives page reloads.

    Args:
        event: API Gateway event with domain in body.
        workspace_id: Workspace ID.

    Returns:
        API response with DNS records and verification status.
    """
    body = json.loads(event.get("body") or "{}")
    domain = body.get("domain", "").strip().lower()

    if not domain:
        return error("Missing 'domain' in request body", 400)

    if "." not in domain:
        return error("Invalid domain format", 400)

    email_service = EmailService()
    result = email_service.setup_domain(domain)

    # Check SPF/DMARC DNS records
    dns_status = _check_dns_records(domain)
    result["spf_valid"] = dns_status.get("spf_valid", False)
    result["dmarc_valid"] = dns_status.get("dmarc_valid", False)

    # Persist to DynamoDB
    _save_domain_setup(workspace_id, domain, result)

    # Auto-populate workspace from_email if not set
    _auto_set_from_email(workspace_id, domain)

    # Auto-create a site for this domain if one doesn't exist
    site = _auto_create_site(workspace_id, domain)

    logger.info("Domain setup saved", workspace_id=workspace_id, domain=domain)

    if site:
        result["site_id"] = site.id

    return success(result)


def _check_dns_records(domain: str) -> dict[str, Any]:
    """Quick DNS check for SPF and DMARC records (no blacklist).

    Args:
        domain: Domain to check.

    Returns:
        Dict with spf_valid, dmarc_valid fields.
    """
    try:
        from complens.services.domain_health_service import DomainHealthService
        health_service = DomainHealthService()
        dns_result = health_service._check_spf_dmarc(domain)
        return {
            "spf_valid": dns_result.get("spf_valid", False),
            "dmarc_valid": dns_result.get("dmarc_valid", False),
        }
    except Exception as e:
        logger.warning("DNS check failed", domain=domain, error=str(e), exc_info=True)
        return {"spf_valid": False, "dmarc_valid": False}


def list_domains_handler(workspace_id: str) -> dict:
    """List all configured domains with their current auth status.

    Args:
        workspace_id: Workspace ID.

    Returns:
        API response with domain list including auth status and DNS check.
    """
    saved_domains = _list_saved_domains(workspace_id)
    email_service = EmailService()

    items = []
    for record in saved_domains:
        domain = record["domain"]
        auth_status = email_service.check_domain_auth(domain)
        dns_status = _check_dns_records(domain)

        items.append({
            "domain": domain,
            "verification_token": record.get("verification_token"),
            "dkim_tokens": record.get("dkim_tokens", []),
            "dns_records": record.get("dns_records", []),
            "created_at": record.get("created_at"),
            "verified": auth_status.get("verified", False),
            "dkim_enabled": auth_status.get("dkim_enabled", False),
            "dkim_status": auth_status.get("dkim_status"),
            "spf_valid": dns_status.get("spf_valid", False),
            "dmarc_valid": dns_status.get("dmarc_valid", False),
            "ready": auth_status.get("ready", False),
        })

    return success({"items": items})


def check_domain_auth(event: dict) -> dict:
    """Check domain authentication status (verification + DKIM + SPF + DMARC).

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

    # Enrich with SPF/DMARC status from DNS checks
    try:
        from complens.services.domain_health_service import DomainHealthService
        health_service = DomainHealthService()
        spf_dmarc = health_service._check_spf_dmarc(domain)
        auth_status["spf_valid"] = spf_dmarc.get("spf_valid", False)
        auth_status["dmarc_valid"] = spf_dmarc.get("dmarc_valid", False)
    except Exception:
        logger.debug("SPF/DMARC check failed during domain auth", domain=domain)

    return success(auth_status)


def get_domain_health(service: WarmupService, workspace_id: str, domain: str) -> dict:
    """Get domain health score with DNS auth, blacklist, and engagement data.

    Uses a 5-minute server-side cache on the WarmupDomain record to avoid
    repeated slow DNS lookups.

    Args:
        service: WarmupService.
        workspace_id: Workspace ID.
        domain: Email sending domain.

    Returns:
        API response with DomainHealthResponse.
    """
    warmup = service.get_status(domain)
    if not warmup or warmup.workspace_id != workspace_id:
        return not_found("warmup_domain", domain)

    # Check cache (5-minute TTL)
    cache_ttl_seconds = 300
    now = datetime.now(timezone.utc)
    if warmup.health_check_result and warmup.health_check_at:
        try:
            hca = warmup.health_check_at
            checked_at = hca if isinstance(hca, datetime) else datetime.fromisoformat(hca)
            if (now - checked_at).total_seconds() < cache_ttl_seconds:
                cached_response = DomainHealthResponse.model_validate(
                    warmup.health_check_result
                )
                cached_response.cached = True
                return success(cached_response.model_dump(mode="json"))
        except Exception:
            pass  # Invalid cache, proceed with fresh check

    # Fresh check
    from complens.services.domain_health_service import DomainHealthService

    health_service = DomainHealthService()
    dns_result = health_service.check_dns(domain)

    # Get SES DKIM status
    email_service = EmailService()
    auth_status = email_service.check_domain_auth(domain)
    dkim_enabled = auth_status.get("dkim_enabled", False)

    # Compute score
    score, breakdown = DomainHealthService.compute_health_score(
        spf_valid=dns_result["spf_valid"],
        dkim_enabled=dkim_enabled,
        dmarc_valid=dns_result["dmarc_valid"],
        dmarc_policy=dns_result["dmarc_policy"],
        blacklist_count=len(dns_result["blacklist_listings"]),
        bounce_rate=warmup.bounce_rate,
        complaint_rate=warmup.complaint_rate,
        open_rate=warmup.open_rate,
    )

    checked_at_str = now.isoformat()
    health_response = DomainHealthResponse(
        domain=domain,
        score=score,
        status=DomainHealthService.score_to_status(score),
        spf_valid=dns_result["spf_valid"],
        spf_record=dns_result["spf_record"],
        dkim_enabled=dkim_enabled,
        dmarc_valid=dns_result["dmarc_valid"],
        dmarc_record=dns_result["dmarc_record"],
        dmarc_policy=dns_result["dmarc_policy"],
        mx_valid=dns_result["mx_valid"],
        mx_hosts=dns_result["mx_hosts"],
        blacklisted=dns_result["blacklisted"],
        blacklist_listings=dns_result["blacklist_listings"],
        bounce_rate=warmup.bounce_rate,
        complaint_rate=warmup.complaint_rate,
        open_rate=warmup.open_rate,
        score_breakdown=breakdown,
        checked_at=checked_at_str,
        cached=False,
        errors=dns_result["errors"],
    )

    # Cache on warmup record
    warmup.health_check_result = health_response.model_dump(mode="json")
    warmup.health_check_at = checked_at_str
    service.repo.update_warmup(warmup)

    logger.info(
        "Domain health check completed",
        domain=domain,
        score=score,
        status=health_response.status,
    )

    return success(health_response.model_dump(mode="json"))
