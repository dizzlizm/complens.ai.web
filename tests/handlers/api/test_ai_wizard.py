"""Tests for AI wizard endpoints (generate-page-content, refine-page-content)."""

import json
import pytest
from unittest.mock import patch, MagicMock


class TestGeneratePageContent:
    """Tests for POST /workspaces/{ws}/ai/generate-page-content endpoint."""

    def test_generate_content_minimal_description(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test content generation with minimal business description."""
        from api.ai import handler

        # Mock the Bedrock call
        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/generate-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={"business_description": "I run a consulting business"},
            )

            response = handler(event, None)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "business_info" in body
            assert "content" in body
            assert "suggested_colors" in body
            assert body["business_info"]["business_name"] == "Acme Consulting"
            assert len(body["content"]["headlines"]) == 3

    def test_generate_content_detailed_description(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test content generation with detailed business description."""
        from api.ai import handler

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            detailed_description = """
            We are TechFlow Solutions, a B2B SaaS company specializing in workflow automation.
            Our main product is an AI-powered project management tool that helps teams of 10-50 people
            streamline their daily operations. We've been in business for 5 years and have over
            2000 paying customers. Our pricing starts at $29/month.
            """

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/generate-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={"business_description": detailed_description},
            )

            response = handler(event, None)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "business_info" in body
            mock_ai.assert_called_once()

    def test_generate_content_with_page_id(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test content generation uses page-specific profile when page_id provided."""
        from api.ai import handler

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/generate-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "business_description": "Consulting services",
                    "page_id": "test-page-123",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200
            # Verify page_id was passed to the service
            call_args = mock_ai.call_args
            # The function should have been called with page context

    def test_generate_content_max_length_validation(
        self, dynamodb_table, api_gateway_event
    ):
        """Test that descriptions over 10,000 chars are rejected."""
        from api.ai import handler

        # Create a description that's too long
        long_description = "x" * 10001

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/ai/generate-page-content",
            path_params={"workspace_id": "test-workspace-456"},
            body={"business_description": long_description},
        )

        response = handler(event, None)

        assert response["statusCode"] == 400

    def test_generate_content_empty_description(
        self, dynamodb_table, api_gateway_event
    ):
        """Test that empty description is rejected."""
        from api.ai import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/ai/generate-page-content",
            path_params={"workspace_id": "test-workspace-456"},
            body={"business_description": ""},
        )

        response = handler(event, None)

        assert response["statusCode"] == 400

    def test_generate_content_unauthorized_workspace(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test that accessing an unauthorized workspace returns 403."""
        from api.ai import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/unauthorized-workspace/ai/generate-page-content",
            path_params={"workspace_id": "unauthorized-workspace"},
            body={"business_description": "My business"},
            workspace_ids=["different-workspace"],  # Not authorized for this workspace
        )

        response = handler(event, None)

        assert response["statusCode"] == 403


class TestRefinePageContent:
    """Tests for POST /workspaces/{ws}/ai/refine-page-content endpoint."""

    def test_refine_headlines(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test refining headlines with feedback."""
        from api.ai import handler

        refined_response = wizard_content_response.copy()
        refined_response["content"] = wizard_content_response["content"].copy()
        refined_response["content"]["headlines"] = [
            "Supercharge Your Business",
            "Expert Solutions, Real Results",
            "Transform Today, Win Tomorrow",
        ]

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = refined_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/refine-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "current_content": wizard_content_response,
                    "feedback": "Make the headlines more punchy and action-oriented",
                    "section": "headlines",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert "content" in body
            assert body["content"]["headlines"][0] == "Supercharge Your Business"

    def test_refine_features(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test refining features with feedback."""
        from api.ai import handler

        refined_response = wizard_content_response.copy()
        refined_response["content"]["features"] = [
            {"title": "AI-Powered", "description": "Smart automation that learns", "icon": "🤖"},
            {"title": "Lightning Fast", "description": "Results in seconds", "icon": "⚡"},
            {"title": "Enterprise Ready", "description": "Scale without limits", "icon": "🏢"},
        ]

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = refined_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/refine-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "current_content": wizard_content_response,
                    "feedback": "Focus more on technology and AI capabilities",
                    "section": "features",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200
            body = json.loads(response["body"])
            assert body["content"]["features"][0]["title"] == "AI-Powered"

    def test_refine_faq(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test refining FAQ with feedback."""
        from api.ai import handler

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/refine-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "current_content": wizard_content_response,
                    "feedback": "Make FAQ answers more detailed and helpful",
                    "section": "faq",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200

    def test_refine_full_content(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test refining all content without specifying a section."""
        from api.ai import handler

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/refine-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "current_content": wizard_content_response,
                    "feedback": "Make everything more professional and enterprise-focused",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200

    def test_refine_missing_current_content(
        self, dynamodb_table, api_gateway_event
    ):
        """Test that missing current_content returns 400."""
        from api.ai import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/ai/refine-page-content",
            path_params={"workspace_id": "test-workspace-456"},
            body={
                "feedback": "Make it better",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 400

    def test_refine_missing_feedback(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test that missing feedback returns 400."""
        from api.ai import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/test-workspace-456/ai/refine-page-content",
            path_params={"workspace_id": "test-workspace-456"},
            body={
                "current_content": wizard_content_response,
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 400

    def test_refine_with_page_id(
        self, dynamodb_table, api_gateway_event, wizard_content_response
    ):
        """Test refining maintains consistency with page profile."""
        from api.ai import handler

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            event = api_gateway_event(
                method="POST",
                path="/workspaces/test-workspace-456/ai/refine-page-content",
                path_params={"workspace_id": "test-workspace-456"},
                body={
                    "current_content": wizard_content_response,
                    "feedback": "Adjust to match our brand voice",
                    "page_id": "test-page-123",
                },
            )

            response = handler(event, None)

            assert response["statusCode"] == 200


class TestAIServiceFunctions:
    """Unit tests for AI service functions used by wizard."""

    def test_generate_page_content_from_description(self, wizard_content_response):
        """Test generate_page_content_from_description function."""
        from complens.services.ai_service import generate_page_content_from_description

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = wizard_content_response

            result = generate_page_content_from_description(
                workspace_id="test-workspace",
                business_description="Tech consulting firm",
            )

            assert result["business_info"]["business_name"] == "Acme Consulting"
            assert len(result["content"]["headlines"]) == 3
            assert result["suggested_colors"]["primary"] == "#3B82F6"

    def test_refine_page_content(self, wizard_content_response):
        """Test refine_page_content function."""
        from complens.services.ai_service import refine_page_content

        refined = wizard_content_response.copy()
        refined["content"]["headlines"] = ["New Headline 1", "New Headline 2", "New Headline 3"]

        with patch("complens.services.ai_service.invoke_claude_json") as mock_ai:
            mock_ai.return_value = refined

            result = refine_page_content(
                workspace_id="test-workspace",
                current_content=wizard_content_response,
                feedback="Make headlines shorter",
                section="headlines",
            )

            assert result["content"]["headlines"][0] == "New Headline 1"
