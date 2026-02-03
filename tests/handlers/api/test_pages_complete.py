"""Tests for POST /workspaces/{ws}/pages/create-complete endpoint."""

import json
import pytest
from unittest.mock import patch, MagicMock


class TestCreateCompletePage:
    """Tests for the create-complete endpoint that creates page + form + workflow."""

    @pytest.fixture
    def create_complete_request(self, wizard_content_response):
        """Standard request body for create-complete endpoint."""
        return {
            "name": "My Landing Page",
            "slug": "my-landing-page",
            "subdomain": "mypage",
            "content": wizard_content_response,
            "style": "professional",
            "colors": {
                "primary": "#3B82F6",
                "secondary": "#60A5FA",
                "accent": "#DBEAFE",
            },
            "include_form": True,
            "include_chat": True,
            "automation": {
                "send_welcome_email": True,
                "notify_owner": True,
                "owner_email": "owner@example.com",
                "welcome_message": "Thanks for reaching out!",
                "add_tags": ["lead", "website"],
            },
        }

    def test_create_complete_with_all_options(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating complete package with form and workflow."""
        from api.pages import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        # Check page was created
        assert body["page"] is not None
        assert body["page"]["name"] == "My Landing Page"
        assert body["page"]["slug"] == "my-landing-page"
        assert body["page"]["subdomain"] == "mypage"
        assert len(body["page"]["blocks"]) > 0

        # Check form was created
        assert body["form"] is not None
        assert body["form"]["name"] == "Contact - My Landing Page"
        assert len(body["form"]["fields"]) == 4  # email, name, phone, message

        # Check workflow was created
        assert body["workflow"] is not None
        assert "Lead Automation" in body["workflow"]["name"]
        assert len(body["workflow"]["nodes"]) >= 3  # trigger + tag + emails

    def test_create_complete_page_only(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating page without form."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["include_form"] = False

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["page"] is not None
        assert body["form"] is None
        assert body["workflow"] is None

    def test_create_complete_with_form_no_automation(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating page with form but no automation emails."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["automation"] = {
            "send_welcome_email": False,
            "notify_owner": False,
            "add_tags": ["lead"],
        }

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["page"] is not None
        assert body["form"] is not None
        # No workflow created since no email automation
        assert body["workflow"] is None

    def test_create_complete_welcome_email_only(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating workflow with only welcome email."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["automation"] = {
            "send_welcome_email": True,
            "notify_owner": False,
            "add_tags": ["lead"],
        }

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["workflow"] is not None
        # Should have trigger + tags + welcome email
        nodes = body["workflow"]["nodes"]
        node_types = [n["type"] for n in nodes]
        assert "trigger_form_submitted" in node_types
        assert "action_send_email" in node_types

    def test_create_complete_notify_owner_only(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating workflow with only owner notification."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["automation"] = {
            "send_welcome_email": False,
            "notify_owner": True,
            "owner_email": "boss@company.com",
            "add_tags": [],
        }

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["workflow"] is not None
        nodes = body["workflow"]["nodes"]
        # Find the notify owner node and check the email
        notify_nodes = [n for n in nodes if n["data"]["label"] == "Notify Owner"]
        assert len(notify_nodes) == 1
        assert notify_nodes[0]["data"]["config"]["to"] == "boss@company.com"

    def test_create_complete_with_custom_tags(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that custom tags are applied to the form and workflow."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["automation"]["add_tags"] = ["premium", "landing-page", "2024"]

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        # Check form has the tags
        assert body["form"]["add_tags"] == ["premium", "landing-page", "2024"]

        # Check workflow has tag action
        nodes = body["workflow"]["nodes"]
        tag_nodes = [n for n in nodes if n["type"] == "action_update_contact"]
        assert len(tag_nodes) == 1
        assert tag_nodes[0]["data"]["config"]["add_tags"] == ["premium", "landing-page", "2024"]

    def test_create_complete_slug_uniqueness(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that duplicate slugs are rejected."""
        from api.pages import handler

        # Create first page
        event1 = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )
        response1 = handler(event1, None)
        assert response1["statusCode"] == 201

        # Try to create second page with same slug
        event2 = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )
        response2 = handler(event2, None)

        assert response2["statusCode"] == 400
        body = json.loads(response2["body"])
        assert "slug" in body.get("message", "").lower() or "SLUG_EXISTS" in str(body)

    def test_create_complete_subdomain_uniqueness(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that duplicate subdomains are rejected."""
        from api.pages import handler

        # Create first page
        event1 = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )
        response1 = handler(event1, None)
        assert response1["statusCode"] == 201

        # Try to create second page with same subdomain but different slug
        request2 = create_complete_request.copy()
        request2["slug"] = "different-slug"
        # Same subdomain

        event2 = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request2,
        )
        response2 = handler(event2, None)

        assert response2["statusCode"] == 400
        body = json.loads(response2["body"])
        assert "subdomain" in body.get("message", "").lower() or "SUBDOMAIN" in str(body)

    def test_create_complete_reserved_subdomain(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that reserved subdomains are rejected."""
        from api.pages import handler

        request = create_complete_request.copy()
        request["subdomain"] = "api"  # Reserved

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = json.loads(response["body"])
        assert "reserved" in body.get("message", "").lower() or "RESERVED" in str(body)

    def test_create_complete_form_linked_to_page(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that form is properly linked to the page."""
        from api.pages import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        page_id = body["page"]["id"]
        form_id = body["form"]["id"]

        # Form should reference the page
        assert body["form"]["page_id"] == page_id

        # Page should reference the form
        assert form_id in body["page"]["form_ids"]

        # Form block should have the form ID
        form_blocks = [b for b in body["page"]["blocks"] if b["type"] == "form"]
        assert len(form_blocks) == 1
        assert form_blocks[0]["config"]["formId"] == form_id

    def test_create_complete_workflow_linked_to_page(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that workflow is properly linked to the page."""
        from api.pages import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        page_id = body["page"]["id"]

        # Workflow should reference the page
        assert body["workflow"]["page_id"] == page_id

    def test_create_complete_page_is_published(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that created page has published status."""
        from api.pages import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["page"]["status"] == "published"

    def test_create_complete_chat_config(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that chat config is properly set."""
        from api.pages import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=create_complete_request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        chat_config = body["page"]["chat_config"]
        assert chat_config["enabled"] is True
        assert chat_config["position"] == "bottom-right"
        assert "Acme Consulting" in chat_config["initial_message"]

    def test_create_complete_without_subdomain(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test creating page without claiming a subdomain."""
        from api.pages import handler

        request = create_complete_request.copy()
        del request["subdomain"]

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = json.loads(response["body"])

        assert body["page"]["subdomain"] is None

    def test_create_complete_missing_name(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that missing name returns 400."""
        from api.pages import handler

        request = create_complete_request.copy()
        del request["name"]

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 400

    def test_create_complete_missing_slug(
        self, dynamodb_table, api_gateway_event, create_complete_request
    ):
        """Test that missing slug returns 400."""
        from api.pages import handler

        request = create_complete_request.copy()
        del request["slug"]

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/pages/create-complete",
            path_params={"workspace_id": "test-workspace-456"},
            body=request,
        )

        response = handler(event, None)

        assert response["statusCode"] == 400


class TestBuildBlocksFromContent:
    """Tests for the _build_blocks_from_content helper function."""

    def test_hero_block_created(self, wizard_content_response):
        """Test that hero block is created with correct content."""
        from api.pages import _build_blocks_from_content

        blocks = _build_blocks_from_content(
            content=wizard_content_response["content"],
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6", "secondary": "#60A5FA", "accent": "#DBEAFE"},
        )

        hero_blocks = [b for b in blocks if b.type == "hero"]
        assert len(hero_blocks) == 1

        hero = hero_blocks[0]
        assert hero.config["headline"] == "Transform Your Business"
        assert "Partner with experts" in hero.config["subheadline"]
        assert hero.config["buttonText"] == "Get Started"

    def test_features_block_created(self, wizard_content_response):
        """Test that features block is created."""
        from api.pages import _build_blocks_from_content

        blocks = _build_blocks_from_content(
            content=wizard_content_response["content"],
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        feature_blocks = [b for b in blocks if b.type == "features"]
        assert len(feature_blocks) == 1

        features = feature_blocks[0]
        assert len(features.config["items"]) == 3
        assert features.config["items"][0]["title"] == "Strategy"

    def test_testimonials_block_created(self, wizard_content_response):
        """Test that testimonials block is created with avatars."""
        from api.pages import _build_blocks_from_content

        content = wizard_content_response["content"].copy()
        content["testimonial_avatars"] = [
            "https://example.com/avatar1.jpg",
            "https://example.com/avatar2.jpg",
        ]

        blocks = _build_blocks_from_content(
            content=content,
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        testimonial_blocks = [b for b in blocks if b.type == "testimonials"]
        assert len(testimonial_blocks) == 1

        testimonials = testimonial_blocks[0]
        assert len(testimonials.config["items"]) >= 2
        # Check avatars are applied
        assert testimonials.config["items"][0]["avatar"] == "https://example.com/avatar1.jpg"

    def test_faq_block_created(self, wizard_content_response):
        """Test that FAQ block is created."""
        from api.pages import _build_blocks_from_content

        blocks = _build_blocks_from_content(
            content=wizard_content_response["content"],
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        faq_blocks = [b for b in blocks if b.type == "faq"]
        assert len(faq_blocks) == 1

        faq = faq_blocks[0]
        assert len(faq.config["items"]) == 2
        assert "How long" in faq.config["items"][0]["question"]

    def test_form_block_created(self, wizard_content_response):
        """Test that form block placeholder is created."""
        from api.pages import _build_blocks_from_content

        blocks = _build_blocks_from_content(
            content=wizard_content_response["content"],
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        form_blocks = [b for b in blocks if b.type == "form"]
        assert len(form_blocks) == 1

        form = form_blocks[0]
        assert form.config["title"] == "Get in Touch"

    def test_cta_block_created(self, wizard_content_response):
        """Test that CTA block is created."""
        from api.pages import _build_blocks_from_content

        blocks = _build_blocks_from_content(
            content=wizard_content_response["content"],
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        cta_blocks = [b for b in blocks if b.type == "cta"]
        assert len(cta_blocks) == 1

        cta = cta_blocks[0]
        assert "Ready" in cta.config["headline"]
        assert cta.config["backgroundColor"] == "#3B82F6"

    def test_hero_with_image(self, wizard_content_response):
        """Test that hero block uses image when provided."""
        from api.pages import _build_blocks_from_content

        content = wizard_content_response["content"].copy()
        content["hero_image_url"] = "https://example.com/hero.jpg"

        blocks = _build_blocks_from_content(
            content=content,
            business_info=wizard_content_response["business_info"],
            style="professional",
            colors={"primary": "#3B82F6"},
        )

        hero = [b for b in blocks if b.type == "hero"][0]
        assert hero.config["backgroundType"] == "image"
        assert hero.config["backgroundImage"] == "https://example.com/hero.jpg"


class TestBuildAutomationWorkflow:
    """Tests for the _build_automation_workflow helper function."""

    def test_workflow_with_all_actions(self):
        """Test workflow creation with all automation options."""
        from api.pages import _build_automation_workflow, AutomationConfig

        automation = AutomationConfig(
            send_welcome_email=True,
            notify_owner=True,
            owner_email="owner@test.com",
            welcome_message="Welcome aboard!",
            add_tags=["lead", "website"],
        )

        workflow = _build_automation_workflow(
            workspace_id="ws-123",
            page_id="page-456",
            form_id="form-789",
            business_name="Test Business",
            automation=automation,
        )

        assert workflow.name == "Lead Automation - Test Business"
        # Status is a string after model_dump, or enum object
        status = workflow.status.value if hasattr(workflow.status, 'value') else workflow.status
        assert status == "active"

        node_types = [n.node_type for n in workflow.nodes]
        assert "trigger_form_submitted" in node_types
        assert "action_update_contact" in node_types
        assert node_types.count("action_send_email") == 2  # welcome + notify

    def test_workflow_trigger_has_form_id(self):
        """Test that trigger node has correct form ID."""
        from api.pages import _build_automation_workflow, AutomationConfig

        automation = AutomationConfig(send_welcome_email=True)

        workflow = _build_automation_workflow(
            workspace_id="ws-123",
            page_id="page-456",
            form_id="form-789",
            business_name="Test",
            automation=automation,
        )

        trigger = [n for n in workflow.nodes if n.node_type == "trigger_form_submitted"][0]
        assert trigger.get_config()["form_id"] == "form-789"

    def test_workflow_edges_connect_nodes(self):
        """Test that workflow edges properly connect nodes."""
        from api.pages import _build_automation_workflow, AutomationConfig

        automation = AutomationConfig(
            send_welcome_email=True,
            notify_owner=True,
            owner_email="test@test.com",
            add_tags=["lead"],
        )

        workflow = _build_automation_workflow(
            workspace_id="ws-123",
            page_id="page-456",
            form_id="form-789",
            business_name="Test",
            automation=automation,
        )

        # Check all nodes are connected
        node_ids = {n.id for n in workflow.nodes}
        for edge in workflow.edges:
            assert edge.source in node_ids
            assert edge.target in node_ids
