"""Tests for the public pages API handler (no authentication required)."""

import json
import os

import pytest
from unittest.mock import patch, MagicMock

from complens.models.page import Page, PageStatus, ChatConfig
from complens.models.form import Form, FormField, FormFieldType
from complens.repositories.page import PageRepository
from complens.repositories.form import FormRepository
from complens.utils.rate_limiter import RateLimitResult


WORKSPACE_ID = "test-workspace-456"


def _parse_body(response: dict) -> dict:
    """Parse JSON response body."""
    return json.loads(response["body"])


def public_event(
    method="GET",
    path="/",
    path_params=None,
    query_params=None,
    body=None,
    headers=None,
    source_ip="1.2.3.4",
):
    """Build an API Gateway event for public (unauthenticated) endpoints."""
    return {
        "httpMethod": method,
        "path": path,
        "pathParameters": path_params or {},
        "queryStringParameters": query_params or {},
        "body": json.dumps(body) if body else None,
        "headers": headers or {"Content-Type": "application/json"},
        "requestContext": {
            "identity": {"sourceIp": source_ip},
        },
    }


def _seed_published_page(workspace_id=WORKSPACE_ID, slug="test-landing",
                         subdomain=None, form_ids=None):
    """Create and persist a published page in the mocked DynamoDB table."""
    page = Page(
        workspace_id=workspace_id,
        name="Test Landing Page",
        slug=slug,
        headline="Welcome to Our Service",
        subheadline="The best solution for your needs",
        blocks=[],
        primary_color="#6366f1",
        status=PageStatus.PUBLISHED,
        subdomain=subdomain,
        form_ids=form_ids or [],
        chat_config=ChatConfig(enabled=False),
    )
    repo = PageRepository()
    return repo.create_page(page)


def _seed_draft_page(workspace_id=WORKSPACE_ID, slug="draft-page"):
    """Create and persist a draft page in the mocked DynamoDB table."""
    page = Page(
        workspace_id=workspace_id,
        name="Draft Page",
        slug=slug,
        headline="Not Ready Yet",
        blocks=[],
        primary_color="#6366f1",
        status=PageStatus.DRAFT,
        chat_config=ChatConfig(enabled=False),
    )
    repo = PageRepository()
    return repo.create_page(page)


def _seed_form(workspace_id=WORKSPACE_ID, page_id=None, form_id=None,
               required_email=True, required_name=True):
    """Create and persist a form in the mocked DynamoDB table."""
    fields = []
    if required_email:
        fields.append(
            FormField(
                id="field-email",
                name="email",
                label="Email",
                type=FormFieldType.EMAIL,
                required=True,
                map_to_contact_field="email",
            )
        )
    if required_name:
        fields.append(
            FormField(
                id="field-name",
                name="name",
                label="Name",
                type=FormFieldType.TEXT,
                required=True,
                map_to_contact_field="first_name",
            )
        )

    form = Form(
        workspace_id=workspace_id,
        page_id=page_id,
        name="Contact Form",
        fields=fields,
        submit_button_text="Submit",
        success_message="Thanks for reaching out!",
        create_contact=True,
        trigger_workflow=True,
    )
    if form_id:
        form.id = form_id

    repo = FormRepository()
    return repo.create_form(form)


class TestPublicPages:
    """Tests for the public pages handler (no auth required)."""

    # -----------------------------------------------------------------
    # 1. Get page by slug -- success
    # -----------------------------------------------------------------
    def test_get_page_by_slug(self, dynamodb_table):
        """GET /public/pages/{slug}?ws=... returns 200 for a published page."""
        from api.public_pages import handler

        page = _seed_published_page(slug="test-landing")

        event = public_event(
            method="GET",
            path="/public/pages/test-landing",
            path_params={"slug": "test-landing"},
            query_params={"ws": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["slug"] == "test-landing"
        assert body["headline"] == "Welcome to Our Service"
        assert body["status"] == "published"
        # Sensitive fields should be stripped
        assert "workspace_id" not in body
        assert "view_count" not in body

    # -----------------------------------------------------------------
    # 2. Get page by slug -- not found
    # -----------------------------------------------------------------
    def test_get_page_by_slug_not_found(self, dynamodb_table):
        """GET with a non-existent slug returns 404."""
        from api.public_pages import handler

        event = public_event(
            method="GET",
            path="/public/pages/does-not-exist",
            path_params={"slug": "does-not-exist"},
            query_params={"ws": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 3. Get page by slug -- unpublished (draft) returns 404
    # -----------------------------------------------------------------
    def test_get_page_by_slug_unpublished(self, dynamodb_table):
        """GET for a draft page returns 404 (only published pages are public)."""
        from api.public_pages import handler

        _seed_draft_page(slug="draft-page")

        event = public_event(
            method="GET",
            path="/public/pages/draft-page",
            path_params={"slug": "draft-page"},
            query_params={"ws": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 4. Get page by subdomain -- success (returns HTML)
    # -----------------------------------------------------------------
    def test_get_page_by_subdomain(self, dynamodb_table):
        """GET /public/subdomain/{subdomain} returns 200 with HTML content-type."""
        from api.public_pages import handler

        _seed_published_page(slug="sub-test", subdomain="mycompany")

        event = public_event(
            method="GET",
            path="/public/subdomain/mycompany",
            path_params={"subdomain": "mycompany"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        assert "text/html" in response["headers"]["Content-Type"]
        # Should contain rendered HTML
        assert "<!DOCTYPE html>" in response["body"] or "<html" in response["body"]

    # -----------------------------------------------------------------
    # 5. Submit page form -- success
    # -----------------------------------------------------------------
    @patch("api.public_pages.check_rate_limit")
    def test_submit_form_success(self, mock_rate_limit, dynamodb_table):
        """POST /public/submit/page/{page_id} with valid data returns 200 with success=true."""
        from api.public_pages import handler

        mock_rate_limit.return_value = RateLimitResult(
            allowed=True, requests_remaining=5, retry_after=None
        )

        # Seed page and form, linking them via form_ids
        form = _seed_form(page_id="will-set-later")
        page = _seed_published_page(slug="form-page", form_ids=[form.id])

        # Update form to point at the actual page
        form.page_id = page.id
        FormRepository().update_form(form)

        event = public_event(
            method="POST",
            path=f"/public/submit/page/{page.id}",
            path_params={"page_id": page.id},
            body={
                "form_id": form.id,
                "workspace_id": WORKSPACE_ID,
                "data": {
                    "email": "alice@example.com",
                    "name": "Alice",
                },
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        assert "submission_id" in body
        assert body["message"] == "Thanks for reaching out!"

    # -----------------------------------------------------------------
    # 6. Submit form -- missing required field returns 400
    # -----------------------------------------------------------------
    @patch("api.public_pages.check_rate_limit")
    def test_submit_form_missing_required_field(self, mock_rate_limit, dynamodb_table):
        """POST without a required field returns 400 VALIDATION_ERROR."""
        from api.public_pages import handler

        mock_rate_limit.return_value = RateLimitResult(
            allowed=True, requests_remaining=5, retry_after=None
        )

        form = _seed_form(required_email=True, required_name=True)
        page = _seed_published_page(slug="form-page-req", form_ids=[form.id])
        form.page_id = page.id
        FormRepository().update_form(form)

        event = public_event(
            method="POST",
            path=f"/public/submit/page/{page.id}",
            path_params={"page_id": page.id},
            body={
                "form_id": form.id,
                "workspace_id": WORKSPACE_ID,
                "data": {
                    # Missing "email" -- required field
                    "name": "Bob",
                },
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["error_code"] == "VALIDATION_ERROR"
        # Should mention the missing field
        errors = body["details"]["errors"]
        field_names = [e["field"] for e in errors]
        assert "email" in field_names

    # -----------------------------------------------------------------
    # 7. Submit form -- honeypot triggers silent success
    # -----------------------------------------------------------------
    @patch("api.public_pages.check_rate_limit")
    def test_submit_form_honeypot(self, mock_rate_limit, dynamodb_table):
        """POST with a filled honeypot field returns 200 (silent success, bot detected)."""
        from api.public_pages import handler

        mock_rate_limit.return_value = RateLimitResult(
            allowed=True, requests_remaining=5, retry_after=None
        )

        form = _seed_form()
        page = _seed_published_page(slug="honey-page", form_ids=[form.id])
        form.page_id = page.id
        FormRepository().update_form(form)

        event = public_event(
            method="POST",
            path=f"/public/submit/page/{page.id}",
            path_params={"page_id": page.id},
            body={
                "form_id": form.id,
                "workspace_id": WORKSPACE_ID,
                "_honeypot": "I am a bot",
                "data": {
                    "email": "bot@spam.com",
                    "name": "SpamBot",
                },
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["success"] is True
        # Should NOT contain a submission_id (honeypot short-circuits)
        assert "submission_id" not in body

    # -----------------------------------------------------------------
    # 8. Submit form -- rate limited returns 429
    # -----------------------------------------------------------------
    @patch("api.public_pages.check_rate_limit")
    def test_submit_form_rate_limited(self, mock_rate_limit, dynamodb_table):
        """POST when rate limit is exceeded returns 429 with Retry-After header."""
        from api.public_pages import handler

        mock_rate_limit.return_value = RateLimitResult(
            allowed=False, requests_remaining=0, retry_after=30
        )

        event = public_event(
            method="POST",
            path="/public/submit/page/any-page-id",
            path_params={"page_id": "any-page-id"},
            body={
                "form_id": "any-form",
                "workspace_id": WORKSPACE_ID,
                "data": {"email": "test@example.com"},
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 429
        assert "Retry-After" in response["headers"]

    # -----------------------------------------------------------------
    # 9. Submit form -- page not found returns 404
    # -----------------------------------------------------------------
    @patch("api.public_pages.check_rate_limit")
    def test_submit_form_not_found(self, mock_rate_limit, dynamodb_table):
        """POST to a non-existent page returns 404."""
        from api.public_pages import handler

        mock_rate_limit.return_value = RateLimitResult(
            allowed=True, requests_remaining=5, retry_after=None
        )

        event = public_event(
            method="POST",
            path="/public/submit/page/nonexistent-page",
            path_params={"page_id": "nonexistent-page"},
            body={
                "form_id": "some-form",
                "workspace_id": WORKSPACE_ID,
                "data": {"email": "test@example.com"},
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 10. Get page by slug -- missing ws query param returns 400
    # -----------------------------------------------------------------
    def test_get_page_by_slug_missing_workspace(self, dynamodb_table):
        """GET /public/pages/{slug} without ws query param returns 400."""
        from api.public_pages import handler

        event = public_event(
            method="GET",
            path="/public/pages/some-slug",
            path_params={"slug": "some-slug"},
            query_params={},
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert "Workspace ID" in body["message"] or "ws" in body["message"]

    # -----------------------------------------------------------------
    # 11. Get page by subdomain -- not found returns 404 with HTML
    # -----------------------------------------------------------------
    def test_get_page_by_subdomain_not_found(self, dynamodb_table):
        """GET /public/subdomain/{subdomain} for non-existent subdomain returns 404 HTML."""
        from api.public_pages import handler

        event = public_event(
            method="GET",
            path="/public/subdomain/nonexistent",
            path_params={"subdomain": "nonexistent"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        assert response["headers"]["Content-Type"] == "text/html"
        assert "Page Not Found" in response["body"]

    # -----------------------------------------------------------------
    # 12. OPTIONS preflight returns 200 with CORS headers
    # -----------------------------------------------------------------
    def test_options_preflight(self, dynamodb_table):
        """OPTIONS /public/submit/... returns 200 with CORS headers."""
        from api.public_pages import handler

        event = public_event(
            method="OPTIONS",
            path="/public/submit/page/some-id",
            path_params={"page_id": "some-id"},
            headers={
                "Content-Type": "application/json",
                "Origin": "https://mysite.example.com",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        assert "Access-Control-Allow-Origin" in response["headers"]
        assert "Access-Control-Allow-Methods" in response["headers"]
        assert "POST" in response["headers"]["Access-Control-Allow-Methods"]
