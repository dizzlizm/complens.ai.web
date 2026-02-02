"""Public Pages API handler (no authentication required)."""

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

# Email validation regex
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# Phone validation - allows common formats
PHONE_REGEX = re.compile(r'^[\d\s\-\+\(\)\.]{7,20}$')


def _validate_email(email: str) -> bool:
    """Validate email format."""
    return bool(EMAIL_REGEX.match(email)) if email else False


def _validate_phone(phone: str) -> bool:
    """Validate phone format."""
    return bool(PHONE_REGEX.match(phone)) if phone else False

from complens.models.contact import Contact
from complens.models.form import FormSubmission, SubmitFormRequest
from complens.repositories.contact import ContactRepository
from complens.repositories.form import FormRepository, FormSubmissionRepository
from complens.repositories.page import PageRepository
from complens.services.page_templates import render_full_page
from complens.utils.rate_limiter import (
    check_rate_limit,
    get_client_ip,
    rate_limit_response,
)
from complens.utils.responses import (
    created,
    error,
    not_found,
    public_created,
    public_error,
    public_success,
    success,
    validation_error,
)

logger = structlog.get_logger()


def handle_options_preflight(event: dict) -> dict:
    """Handle OPTIONS preflight requests for public endpoints.

    Returns CORS headers that allow requests from any HTTPS origin.
    This enables form submissions from custom domain landing pages.
    """
    headers = event.get("headers", {}) or {}
    # Get origin (case-insensitive header lookup)
    origin = None
    for key, value in headers.items():
        if key.lower() == "origin":
            origin = value
            break

    # Allow the requesting origin if it's HTTPS, otherwise use wildcard
    allow_origin = origin if origin and origin.startswith("https://") else "*"

    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": allow_origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
            "Access-Control-Max-Age": "600",
            "Content-Type": "application/json",
        },
        "body": "{}",
    }


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle public pages API requests (no auth required).

    Routes:
        GET  /public/pages/{slug}?ws={workspace_id}  - Get page by slug
        GET  /public/forms/{form_id}?ws={workspace_id}  - Get form by ID
        GET  /public/domain/{domain}  - Get rendered page by custom domain
        GET  /public/subdomain/{subdomain}  - Get rendered page by subdomain
        POST /public/submit/page/{page_id}  - Submit form from page
        POST /public/submit/form/{form_id}  - Submit form directly
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        query_params = event.get("queryStringParameters", {}) or {}

        # Extract IDs from path
        slug = path_params.get("slug")
        form_id = path_params.get("form_id")
        page_id = path_params.get("page_id")
        domain = path_params.get("domain")
        subdomain = path_params.get("subdomain")
        workspace_id = query_params.get("ws")

        # Handle OPTIONS preflight for public submit endpoints (custom domain CORS)
        if http_method == "OPTIONS" and "/public/submit/" in path:
            return handle_options_preflight(event)

        # Route to appropriate handler
        if "/public/submit/page/" in path and http_method == "POST":
            return submit_page_form(page_id, event)
        elif "/public/subdomain/" in path and http_method == "GET":
            return get_page_by_subdomain(subdomain)
        elif "/public/domain/" in path and http_method == "GET":
            return get_page_by_domain(domain)
        elif "/public/pages/" in path and http_method == "GET":
            return get_public_page(slug, workspace_id)
        elif "/public/submit/form/" in path and http_method == "POST":
            return submit_form(form_id, event)
        elif "/public/forms/" in path and http_method == "GET":
            return get_public_form(form_id, workspace_id)
        else:
            return error("Not found", 404)

    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Public pages handler error", error=str(e))
        return error("Internal server error", 500)


def get_public_page(slug: str, workspace_id: str | None) -> dict:
    """Get a public page by slug.

    Only returns published pages.
    """
    if not workspace_id:
        return error("Workspace ID (ws) query parameter is required", 400)

    repo = PageRepository()
    page = repo.get_by_slug(workspace_id, slug)

    if not page:
        return not_found("Page", slug)

    # Only return published pages
    status_value = page.status.value if hasattr(page.status, 'value') else page.status
    if status_value != "published":
        return not_found("Page", slug)

    # Increment view count (fire and forget)
    try:
        repo.increment_view_count(workspace_id, page.id)
    except Exception as e:
        logger.warning("Failed to increment view count", page_id=page.id, error=str(e))

    # Return page without sensitive fields
    page_data = page.model_dump(mode="json")

    # Remove internal/sensitive fields from public response
    sensitive_fields = [
        "workspace_id",
        "created_at",
        "updated_at",
        "view_count",
        "form_submission_count",
        "chat_session_count",
        "custom_css",  # Don't expose raw CSS in API response (rendered in HTML)
    ]
    for field in sensitive_fields:
        page_data.pop(field, None)

    return success(page_data)


def get_page_by_subdomain(subdomain: str) -> dict:
    """Get and render a page by subdomain (e.g., mypage.dev.complens.ai).

    Returns full HTML for the page, suitable for serving directly.
    """
    if not subdomain:
        return error("Subdomain is required", 400)

    # Normalize subdomain
    subdomain = subdomain.lower().strip()
    logger.info("Looking up page by subdomain", subdomain=subdomain)

    # Look up page by subdomain using GSI3
    try:
        repo = PageRepository()
        page = repo.get_by_subdomain(subdomain)
    except Exception as e:
        logger.exception("Failed to look up page by subdomain", subdomain=subdomain, error=str(e))
        return error(f"Failed to look up page: {str(e)}", 500)

    if not page:
        logger.info("Page not found for subdomain", subdomain=subdomain)
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "text/html"},
            "body": """<!DOCTYPE html>
<html><head><title>Page Not Found</title></head>
<body style="font-family:system-ui;text-align:center;padding:100px;">
<h1>Page Not Found</h1>
<p>No page is configured for this subdomain.</p>
</body></html>""",
        }

    # Only return published pages
    status_value = page.status.value if hasattr(page.status, 'value') else page.status
    if status_value != "published":
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "text/html"},
            "body": """<!DOCTYPE html>
<html><head><title>Page Not Found</title></head>
<body style="font-family:system-ui;text-align:center;padding:100px;">
<h1>Page Not Found</h1>
<p>This page is not published.</p>
</body></html>""",
        }

    # Increment view count
    try:
        repo.increment_view_count(page.workspace_id, page.id)
    except Exception as e:
        logger.warning("Failed to increment view count", page_id=page.id, error=str(e))

    # Fetch forms associated with this page
    # Supports both legacy (form_ids list) and new (page_id field on forms)
    forms = []
    form_repo = FormRepository()

    # New way: forms with page_id set
    page_forms, _ = form_repo.list_by_page(page.id)
    for form in page_forms:
        forms.append(form.model_dump(mode="json"))

    # Legacy way: forms referenced by form_ids (for backwards compatibility)
    form_ids_set = set(f.get("id") for f in forms)  # Avoid duplicates
    if page.form_ids:
        for form_id in page.form_ids:
            if form_id not in form_ids_set:
                form = form_repo.get_by_id(page.workspace_id, form_id)
                if form:
                    forms.append(form.model_dump(mode="json"))

    # Get API URLs from environment
    ws_url = os.environ.get("WEBSOCKET_ENDPOINT", "wss://ws.dev.complens.ai")
    api_url = os.environ.get("API_URL", "https://api.dev.complens.ai")

    # Render full HTML page with forms
    page_data = page.model_dump(mode="json")

    logger.info(
        "Page data for rendering",
        subdomain=subdomain,
        page_id=page.id,
        has_blocks=len(page.blocks) > 0,
        block_count=len(page.blocks),
        has_body_content=bool(page.body_content),
        blocks_in_data="blocks" in page_data,
        blocks_count_in_data=len(page_data.get("blocks", [])),
    )

    html = render_full_page(page_data, ws_url, api_url, forms=forms)

    logger.info(
        "Rendered page for subdomain",
        subdomain=subdomain,
        page_id=page.id,
        workspace_id=page.workspace_id,
        form_count=len(forms),
    )

    # Build CSP header
    csp_directives = [
        "default-src 'self'",
        f"script-src 'self' 'unsafe-inline' cdn.tailwindcss.com",
        f"style-src 'self' 'unsafe-inline' cdn.tailwindcss.com fonts.googleapis.com",
        "font-src 'self' fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        f"connect-src 'self' {api_url} {ws_url}",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
    csp_header = "; ".join(csp_directives)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Content-Security-Policy": csp_header,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        "body": html,
    }


def get_page_by_domain(domain: str) -> dict:
    """Get and render a page by custom domain.

    Returns full HTML for the page, suitable for serving directly.
    """
    if not domain:
        return error("Domain is required", 400)

    # Normalize domain
    domain = domain.lower().strip()

    # Look up page by domain
    repo = PageRepository()
    page = repo.get_by_custom_domain(domain)

    if not page:
        logger.info("Page not found for domain", domain=domain)
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "text/html"},
            "body": """<!DOCTYPE html>
<html><head><title>Page Not Found</title></head>
<body style="font-family:system-ui;text-align:center;padding:100px;">
<h1>Page Not Found</h1>
<p>No page is configured for this domain.</p>
</body></html>""",
        }

    # Only return published pages
    status_value = page.status.value if hasattr(page.status, 'value') else page.status
    if status_value != "published":
        return {
            "statusCode": 404,
            "headers": {"Content-Type": "text/html"},
            "body": """<!DOCTYPE html>
<html><head><title>Page Not Found</title></head>
<body style="font-family:system-ui;text-align:center;padding:100px;">
<h1>Page Not Found</h1>
<p>This page is not published.</p>
</body></html>""",
        }

    # Increment view count
    try:
        repo.increment_view_count(page.workspace_id, page.id)
    except Exception as e:
        logger.warning("Failed to increment view count", page_id=page.id, error=str(e))

    # Fetch forms associated with this page
    # Supports both legacy (form_ids list) and new (page_id field on forms)
    forms = []
    form_repo = FormRepository()

    # New way: forms with page_id set
    page_forms, _ = form_repo.list_by_page(page.id)
    for form in page_forms:
        forms.append(form.model_dump(mode="json"))

    # Legacy way: forms referenced by form_ids (for backwards compatibility)
    form_ids_set = set(f.get("id") for f in forms)  # Avoid duplicates
    if page.form_ids:
        for form_id in page.form_ids:
            if form_id not in form_ids_set:
                form = form_repo.get_by_id(page.workspace_id, form_id)
                if form:
                    forms.append(form.model_dump(mode="json"))

    # Get API URLs from environment
    ws_url = os.environ.get("WEBSOCKET_ENDPOINT", "wss://ws.dev.complens.ai")
    api_url = os.environ.get("API_URL", "https://api.dev.complens.ai")

    # Render full HTML page with forms
    page_data = page.model_dump(mode="json")
    html = render_full_page(page_data, ws_url, api_url, forms=forms)

    logger.info(
        "Rendered page for custom domain",
        domain=domain,
        page_id=page.id,
        workspace_id=page.workspace_id,
        form_count=len(forms),
    )

    # Build CSP header - restrict content sources for XSS protection
    # Note: 'unsafe-inline' for scripts/styles needed for embedded chat widget
    # In future, could use nonces for tighter security
    csp_directives = [
        "default-src 'self'",
        f"script-src 'self' 'unsafe-inline' cdn.tailwindcss.com",
        f"style-src 'self' 'unsafe-inline' cdn.tailwindcss.com fonts.googleapis.com",
        "font-src 'self' fonts.gstatic.com",
        "img-src 'self' data: https: blob:",  # Allow images from anywhere (user content)
        f"connect-src 'self' {api_url} {ws_url}",
        "frame-ancestors 'none'",  # Prevent clickjacking
        "base-uri 'self'",
        "form-action 'self'",
    ]
    csp_header = "; ".join(csp_directives)

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300",  # Cache for 5 minutes
            "Content-Security-Policy": csp_header,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Referrer-Policy": "strict-origin-when-cross-origin",
        },
        "body": html,
    }


def get_public_form(form_id: str, workspace_id: str | None) -> dict:
    """Get a public form by ID.

    Returns form structure for rendering.
    """
    if not workspace_id:
        return error("Workspace ID (ws) query parameter is required", 400)

    repo = FormRepository()
    form = repo.get_by_id(workspace_id, form_id)

    if not form:
        return not_found("Form", form_id)

    # Return form without sensitive fields
    form_data = form.model_dump(mode="json")

    # Remove internal fields
    for field in ["workspace_id", "submission_count", "trigger_workflow", "add_tags"]:
        form_data.pop(field, None)

    return success(form_data)


def _get_origin(event: dict) -> str | None:
    """Extract Origin header from request (case-insensitive)."""
    headers = event.get("headers", {}) or {}
    # Headers can be mixed case
    for key, value in headers.items():
        if key.lower() == "origin":
            return value
    return None


def _validate_origin(origin: str | None, page=None, form=None) -> bool:
    """Validate that the request origin is allowed.

    Allows:
    - Requests with no origin (same-origin or non-browser)
    - Requests from complens.ai domains
    - Requests from the page's subdomain
    - Requests from the page's custom domain
    - Localhost for development

    Args:
        origin: The Origin header value
        page: Page object (if available) for domain validation
        form: Form object (if available) for workspace validation

    Returns:
        True if origin is allowed, False otherwise
    """
    # No origin header = same-origin request or non-browser client
    if not origin:
        return True

    try:
        from urllib.parse import urlparse
        parsed = urlparse(origin.lower())
        host = parsed.netloc or parsed.path

        # Allow complens.ai and its subdomains
        if host.endswith(".complens.ai") or host == "complens.ai":
            return True

        # Allow localhost for development
        if host.startswith("localhost") or host.startswith("127.0.0.1"):
            stage = os.environ.get("STAGE", "dev")
            return stage in ("dev", "local", "test")

        # If we have a page, check its custom domain and subdomain
        if page:
            if page.custom_domain and host == page.custom_domain.lower():
                return True
            if page.subdomain:
                # Check various complens.ai subdomain formats
                stage = os.environ.get("STAGE", "dev")
                allowed_hosts = [
                    f"{page.subdomain}.complens.ai",
                    f"{page.subdomain}.{stage}.complens.ai",
                ]
                if host in allowed_hosts:
                    return True

        # Origin doesn't match any allowed source
        logger.warning(
            "Origin validation failed",
            origin=origin,
            host=host,
            page_subdomain=getattr(page, "subdomain", None),
            page_custom_domain=getattr(page, "custom_domain", None),
        )
        return False

    except Exception as e:
        logger.warning("Origin parsing failed", origin=origin, error=str(e))
        return False


def submit_page_form(page_id: str, event: dict) -> dict:
    """Submit a form from a page.

    This endpoint handles form submissions that come through pages.
    It validates the form, creates/updates a contact, and triggers workflows.
    """
    origin = _get_origin(event)

    # Rate limit: 5 submissions per minute, 30 per hour per IP
    client_ip = get_client_ip(event)
    rate_check = check_rate_limit(
        identifier=client_ip,
        action="form_submit",
        requests_per_minute=5,
        requests_per_hour=30,
    )
    if not rate_check.allowed:
        return rate_limit_response(rate_check.retry_after or 60)

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return public_error("Invalid JSON body", origin, 400)

    # Honeypot check - if filled, bot detected
    honeypot = body.get("_honeypot") or body.get("honeypot")
    if honeypot:
        logger.debug("Honeypot triggered on page form")
        return public_success({
            "success": True,
            "message": "Thank you for your submission!",
        }, origin)

    form_id = body.get("form_id")
    if not form_id:
        return public_error("form_id is required", origin, 400)

    workspace_id = body.get("workspace_id")
    if not workspace_id:
        return public_error("workspace_id is required", origin, 400)

    # Get page and form
    page_repo = PageRepository()
    form_repo = FormRepository()

    page = page_repo.get_by_id(workspace_id, page_id)
    if not page:
        return public_error(f"Page with ID '{page_id}' not found", origin, 404, "NOT_FOUND")

    # Validate origin to prevent CSRF
    if not _validate_origin(origin, page=page):
        logger.warning(
            "Form submission blocked - invalid origin",
            origin=origin,
            page_id=page_id,
            client_ip=client_ip,
        )
        return public_error("Request origin not allowed", origin, 403, "FORBIDDEN")

    # Verify workspace consistency
    if page.workspace_id != workspace_id:
        return public_error("Invalid workspace", origin, 400)

    form = form_repo.get_by_id(workspace_id, form_id)
    if not form:
        return public_error(f"Form with ID '{form_id}' not found", origin, 404, "NOT_FOUND")

    # Check form is attached to this page
    if form_id not in page.form_ids:
        return public_error("Form not associated with this page", origin, 400)

    # Process the submission
    return _process_form_submission(
        form=form,
        data=body.get("data", {}),
        page_id=page_id,
        event=event,
        origin=origin,
    )


def submit_form(form_id: str, event: dict) -> dict:
    """Submit a form directly (not through a page)."""
    origin = _get_origin(event)

    # Rate limit: 5 submissions per minute, 30 per hour per IP
    client_ip = get_client_ip(event)
    rate_check = check_rate_limit(
        identifier=client_ip,
        action="form_submit",
        requests_per_minute=5,
        requests_per_hour=30,
    )
    if not rate_check.allowed:
        return rate_limit_response(rate_check.retry_after or 60)

    try:
        body = json.loads(event.get("body", "{}"))
        request = SubmitFormRequest.model_validate(body)
    except PydanticValidationError as e:
        return public_error(
            "Validation failed",
            origin,
            400,
            "VALIDATION_ERROR",
            {"errors": [{"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]} for err in e.errors()]},
        )
    except json.JSONDecodeError:
        return public_error("Invalid JSON body", origin, 400)

    # Honeypot check
    if request.honeypot:
        # Bot detected, silently succeed
        logger.info("Honeypot triggered", form_id=form_id)
        return public_success({
            "success": True,
            "message": "Thank you for your submission!",
        }, origin)

    workspace_id = body.get("workspace_id")
    if not workspace_id:
        return public_error("workspace_id is required", origin, 400)

    # Get form
    form_repo = FormRepository()
    form = form_repo.get_by_id(workspace_id, form_id)
    if not form:
        return public_error(f"Form with ID '{form_id}' not found", origin, 404, "NOT_FOUND")

    # Get page if form has page_id for origin validation
    page = None
    if form.page_id:
        page_repo = PageRepository()
        page = page_repo.get_by_id(workspace_id, form.page_id)

    # Validate origin to prevent CSRF
    if not _validate_origin(origin, page=page, form=form):
        logger.warning(
            "Form submission blocked - invalid origin",
            origin=origin,
            form_id=form_id,
            client_ip=client_ip,
        )
        return public_error("Request origin not allowed", origin, 403, "FORBIDDEN")

    # Process the submission
    return _process_form_submission(
        form=form,
        data=request.data,
        page_id=None,
        event=event,
        origin=origin,
    )


MAX_FIELD_LENGTH = 10000  # Max characters per field
MAX_TOTAL_SIZE = 100000  # Max total submission size


def _process_form_submission(
    form: Any,  # Form type
    data: dict,
    page_id: str | None,
    event: dict,
    origin: str | None = None,
) -> dict:
    """Process a form submission.

    1. Validate required fields
    2. Create/update contact if enabled
    3. Save submission record
    4. Trigger workflow via EventBridge if enabled
    5. Update counters
    """
    # Check total payload size
    total_size = sum(len(str(v)) for v in data.values())
    if total_size > MAX_TOTAL_SIZE:
        return public_error("Submission too large", origin, 400)

    # Validate required fields and check field lengths
    validation_errors = []
    sanitized_data = {}

    for field in form.fields:
        value = data.get(field.name)

        # Check field length
        if value and len(str(value)) > MAX_FIELD_LENGTH:
            validation_errors.append({
                "field": field.name,
                "message": f"{field.label} is too long",
            })
            continue

        # Check required fields
        if field.required and not value:
            validation_errors.append({
                "field": field.name,
                "message": f"{field.label} is required",
            })
        elif value:
            # Sanitize and store - strip whitespace and limit length
            sanitized_data[field.name] = str(value).strip()[:MAX_FIELD_LENGTH]

    if validation_errors:
        return public_error(
            "Validation failed",
            origin,
            400,
            "VALIDATION_ERROR",
            {"errors": validation_errors},
        )

    # Extract visitor info from request
    headers = event.get("headers", {}) or {}
    request_context = event.get("requestContext", {}) or {}
    identity = request_context.get("identity", {}) or {}

    visitor_ip = (
        headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or identity.get("sourceIp")
    )
    visitor_user_agent = headers.get("User-Agent")
    referrer = headers.get("Referer")

    # Create or update contact if enabled
    contact_id = None
    if form.create_contact:
        contact_id = _create_or_update_contact(form, sanitized_data)

    # Create submission record with sanitized data
    submission_repo = FormSubmissionRepository()
    submission = FormSubmission(
        workspace_id=form.workspace_id,
        form_id=form.id,
        page_id=page_id,
        contact_id=contact_id,
        data=sanitized_data,
        visitor_ip=visitor_ip,
        visitor_user_agent=visitor_user_agent[:500] if visitor_user_agent else None,
        referrer=referrer[:2000] if referrer else None,
    )
    submission = submission_repo.create_submission(submission)

    # Increment form submission count
    form_repo = FormRepository()
    form_repo.increment_submission_count(form.workspace_id, form.id)

    # Increment page submission count if applicable
    if page_id:
        page_repo = PageRepository()
        page_repo.increment_form_submission_count(form.workspace_id, page_id)

    # Trigger workflow via EventBridge if enabled
    if form.trigger_workflow:
        _trigger_workflow(form, submission, contact_id)

    logger.info(
        "Form submitted",
        form_id=form.id,
        submission_id=submission.id,
        contact_id=contact_id,
        page_id=page_id,
    )

    return public_success({
        "success": True,
        "message": form.success_message,
        "redirect_url": form.redirect_url,
        "submission_id": submission.id,
        "contact_id": contact_id,
    }, origin)


def _create_or_update_contact(form: Any, data: dict) -> str | None:
    """Create or update a contact based on form submission."""
    contact_repo = ContactRepository()

    # Extract contact fields
    email = None
    phone = None
    first_name = None
    last_name = None
    custom_fields = {}

    for field in form.fields:
        value = data.get(field.name)
        if not value:
            continue

        if field.map_to_contact_field:
            if field.map_to_contact_field == "email":
                email = value
            elif field.map_to_contact_field == "phone":
                phone = value
            elif field.map_to_contact_field == "first_name":
                first_name = value
            elif field.map_to_contact_field == "last_name":
                last_name = value
            else:
                custom_fields[field.map_to_contact_field] = value
        elif field.type.value == "email":
            email = value
        elif field.type.value == "phone":
            phone = value

    # Validate and sanitize email/phone
    if email and not _validate_email(email):
        logger.warning("Invalid email format in form submission", email=email[:50])
        email = None
    if phone and not _validate_phone(phone):
        logger.warning("Invalid phone format in form submission", phone=phone[:20])
        phone = None

    # Need at least email or phone to create contact
    if not email and not phone:
        return None

    # Try to find existing contact by email
    existing_contact = None
    if email:
        existing_contact = contact_repo.get_by_email(form.workspace_id, email)

    if existing_contact:
        # Update existing contact
        if first_name:
            existing_contact.first_name = first_name
        if last_name:
            existing_contact.last_name = last_name
        if phone and not existing_contact.phone:
            existing_contact.phone = phone

        # Add tags
        for tag in form.add_tags:
            if tag not in existing_contact.tags:
                existing_contact.tags.append(tag)

        # Merge custom fields
        existing_contact.custom_fields = {
            **existing_contact.custom_fields,
            **custom_fields,
        }

        contact_repo.update_contact(existing_contact)
        return existing_contact.id
    else:
        # Create new contact
        contact = Contact(
            workspace_id=form.workspace_id,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            tags=form.add_tags,
            custom_fields=custom_fields,
            source="form",
        )
        contact = contact_repo.create_contact(contact)
        return contact.id


def _trigger_workflow(form: Any, submission: Any, contact_id: str | None) -> None:
    """Trigger workflow directly via SQS (bypassing EventBridge for reliability)."""
    sqs = boto3.client("sqs")
    queue_url = os.environ.get("WORKFLOW_QUEUE_URL")

    if not queue_url:
        logger.warning("WORKFLOW_QUEUE_URL not configured, skipping workflow trigger")
        return

    # Build the message in the same format the queue processor expects
    message_body = {
        "detail": {
            "trigger_type": "trigger_form_submitted",
            "workspace_id": form.workspace_id,
            "form_id": form.id,
            "submission_id": submission.id,
            "contact_id": contact_id,
            "data": submission.data,
            "page_id": submission.page_id,
            "created_at": submission.created_at.isoformat(),
        }
    }

    try:
        response = sqs.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message_body),
            MessageGroupId="workflow-triggers",
        )

        # Mark submission as workflow triggered
        submission_repo = FormSubmissionRepository()
        submission_repo.mark_workflow_triggered(
            form_id=form.id,
            submission_id=submission.id,
            created_at=submission.created_at.isoformat(),
            workflow_run_id=f"pending-{response.get('MessageId', uuid.uuid4().hex)[:8]}",
        )

        logger.info(
            "Workflow triggered for form submission",
            form_id=form.id,
            submission_id=submission.id,
            message_id=response.get("MessageId"),
        )
    except Exception as e:
        logger.exception(
            "Failed to trigger workflow",
            form_id=form.id,
            submission_id=submission.id,
            error=str(e),
        )
