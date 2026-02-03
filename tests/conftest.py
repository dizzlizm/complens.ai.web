"""Pytest configuration and fixtures."""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Add handlers to the path for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "handlers"))

# Set environment variables before imports
os.environ["TABLE_NAME"] = "complens-test"
os.environ["STAGE"] = "test"
os.environ["SERVICE_NAME"] = "complens"
os.environ["COGNITO_USER_POOL_ID"] = "us-east-1_test123"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"


@pytest.fixture
def aws_credentials():
    """Mock AWS credentials for moto."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@pytest.fixture
def dynamodb_table(aws_credentials):
    """Create mocked DynamoDB table."""
    import boto3
    from moto import mock_aws

    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")

        table = dynamodb.create_table(
            TableName="complens-test",
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
                {"AttributeName": "GSI2PK", "AttributeType": "S"},
                {"AttributeName": "GSI2SK", "AttributeType": "S"},
                {"AttributeName": "GSI3PK", "AttributeType": "S"},
                {"AttributeName": "GSI3SK", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "GSI2",
                    "KeySchema": [
                        {"AttributeName": "GSI2PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI2SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "GSI3",
                    "KeySchema": [
                        {"AttributeName": "GSI3PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI3SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )

        table.wait_until_exists()

        yield table


@pytest.fixture
def sample_contact():
    """Create a sample contact."""
    from complens.models.contact import Contact

    return Contact(
        id="test-contact-123",
        workspace_id="test-workspace-456",
        email="test@example.com",
        phone="+15551234567",
        first_name="John",
        last_name="Doe",
        tags=["lead", "newsletter"],
        sms_opt_in=True,
        email_opt_in=True,
    )


@pytest.fixture
def sample_workflow():
    """Create a sample workflow."""
    from complens.models.workflow import Workflow, WorkflowEdge, WorkflowStatus
    from complens.models.workflow_node import WorkflowNode

    nodes = [
        WorkflowNode(
            id="trigger-1",
            node_type="trigger_tag_added",
            position={"x": 100, "y": 100},
            data={
                "label": "When tag added",
                "config": {"tag_name": "hot-lead"},
            },
        ),
        WorkflowNode(
            id="action-1",
            node_type="action_send_sms",
            position={"x": 100, "y": 250},
            data={
                "label": "Send welcome SMS",
                "config": {
                    "sms_message": "Hi {{contact.first_name}}, welcome!",
                },
            },
        ),
    ]

    edges = [
        WorkflowEdge(
            id="edge-1",
            source="trigger-1",
            target="action-1",
        ),
    ]

    return Workflow(
        id="test-workflow-789",
        workspace_id="test-workspace-456",
        name="Welcome Flow",
        description="Sends welcome SMS when tagged as hot lead",
        status=WorkflowStatus.ACTIVE,
        nodes=nodes,
        edges=edges,
    )


@pytest.fixture
def sample_conversation():
    """Create a sample conversation."""
    from complens.models.conversation import (
        Conversation,
        ConversationChannel,
        ConversationStatus,
    )

    return Conversation(
        id="test-conv-001",
        workspace_id="test-workspace-456",
        contact_id="test-contact-123",
        channel=ConversationChannel.SMS,
        status=ConversationStatus.OPEN,
        ai_enabled=True,
    )


@pytest.fixture
def api_gateway_event():
    """Create a sample API Gateway event."""
    def _create_event(
        method: str = "GET",
        path: str = "/",
        path_params: dict = None,
        query_params: dict = None,
        body: dict = None,
        user_id: str = "test-user-123",
        agency_id: str = "test-agency",
        workspace_ids: list = None,
    ):
        workspace_ids = workspace_ids or ["test-workspace-456"]

        return {
            "httpMethod": method,
            "path": path,
            "pathParameters": path_params or {},
            "queryStringParameters": query_params or {},
            "body": body if isinstance(body, str) else (
                __import__("json").dumps(body) if body else None
            ),
            "headers": {
                "Authorization": "Bearer test-token",
                "Content-Type": "application/json",
            },
            "requestContext": {
                "authorizer": {
                    "userId": user_id,
                    "email": "test@example.com",
                    "agencyId": agency_id,
                    "workspaceIds": ",".join(workspace_ids),
                    "isAdmin": "false",
                },
            },
        }

    return _create_event


@pytest.fixture
def sample_page():
    """Create a sample page."""
    from complens.models.page import Page, PageStatus, ChatConfig

    return Page(
        id="test-page-123",
        workspace_id="test-workspace-456",
        name="Test Landing Page",
        slug="test-landing",
        headline="Welcome to Our Service",
        subheadline="The best solution for your needs",
        blocks=[],
        primary_color="#6366f1",
        status=PageStatus.DRAFT,
        chat_config=ChatConfig(enabled=True),
    )


@pytest.fixture
def sample_form():
    """Create a sample form."""
    from complens.models.form import Form, FormField, FormFieldType

    return Form(
        id="test-form-123",
        workspace_id="test-workspace-456",
        page_id="test-page-123",
        name="Contact Form",
        fields=[
            FormField(
                id="field-1",
                name="email",
                label="Email",
                type=FormFieldType.EMAIL,
                required=True,
            ),
            FormField(
                id="field-2",
                name="name",
                label="Name",
                type=FormFieldType.TEXT,
                required=True,
            ),
        ],
        submit_button_text="Submit",
        success_message="Thanks!",
    )


@pytest.fixture
def mock_bedrock():
    """Mock Bedrock runtime client."""
    with patch("boto3.client") as mock_client:
        mock_bedrock = MagicMock()
        mock_client.return_value = mock_bedrock

        # Mock invoke_model response
        mock_response = MagicMock()
        mock_response.read.return_value = __import__("json").dumps({
            "content": [{"type": "text", "text": "This is a test response."}],
            "stop_reason": "end_turn",
        }).encode()

        mock_bedrock.invoke_model.return_value = {"body": mock_response}

        yield mock_bedrock


@pytest.fixture
def mock_bedrock_json_response():
    """Mock Bedrock response with JSON content for wizard tests."""
    def _create_mock(json_content: dict):
        with patch("boto3.client") as mock_client:
            mock_bedrock = MagicMock()
            mock_client.return_value = mock_bedrock

            mock_response = MagicMock()
            mock_response.read.return_value = __import__("json").dumps({
                "content": [{"type": "text", "text": __import__("json").dumps(json_content)}],
                "stop_reason": "end_turn",
            }).encode()

            mock_bedrock.invoke_model.return_value = {"body": mock_response}
            return mock_bedrock

    return _create_mock


@pytest.fixture
def wizard_content_response():
    """Sample AI response for generate-page-content endpoint."""
    return {
        "business_info": {
            "business_name": "Acme Consulting",
            "business_type": "consultant",
            "industry": "technology",
            "products": ["Strategy Consulting", "Digital Transformation"],
            "audience": "Mid-size tech companies",
            "tone": "professional",
        },
        "content": {
            "headlines": [
                "Transform Your Business",
                "Expert Tech Consulting",
                "Accelerate Growth Today",
            ],
            "tagline": "Strategic solutions for modern challenges",
            "value_props": [
                "10+ years of experience",
                "100+ successful projects",
                "Dedicated support team",
            ],
            "features": [
                {"title": "Strategy", "description": "Clear roadmaps for success", "icon": "🎯"},
                {"title": "Execution", "description": "Hands-on implementation", "icon": "🚀"},
                {"title": "Support", "description": "24/7 expert assistance", "icon": "💡"},
            ],
            "testimonial_concepts": [
                "Transformed our operations completely",
                "Best consulting decision we ever made",
            ],
            "faq": [
                {"q": "How long does a project take?", "a": "Typically 3-6 months"},
                {"q": "What industries do you serve?", "a": "Primarily tech and finance"},
            ],
            "cta_text": "Get Started",
            "hero_subheadline": "Partner with experts who understand your challenges",
            "social_proof": "Trusted by 500+ companies worldwide",
        },
        "suggested_colors": {
            "primary": "#3B82F6",
            "secondary": "#60A5FA",
            "accent": "#DBEAFE",
        },
    }


@pytest.fixture
def mock_sqs():
    """Mock SQS client."""
    with patch("boto3.client") as mock_client:
        mock_sqs = MagicMock()
        mock_client.return_value = mock_sqs

        mock_sqs.send_message.return_value = {
            "MessageId": "test-message-id",
        }

        yield mock_sqs


class LambdaContext:
    """Mock Lambda context."""

    def __init__(self):
        self.function_name = "test-function"
        self.memory_limit_in_mb = 128
        self.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789:function:test"
        self.aws_request_id = "test-request-id"

    def get_remaining_time_in_millis(self):
        return 30000


@pytest.fixture
def lambda_context():
    """Create a mock Lambda context."""
    return LambdaContext()
