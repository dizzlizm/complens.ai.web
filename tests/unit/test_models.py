"""Tests for Pydantic models."""

import pytest
from datetime import datetime, timezone

from complens.models.base import BaseModel, generate_ulid
from complens.models.contact import Contact, CreateContactRequest
from complens.models.workflow import Workflow, WorkflowStatus
from complens.models.workflow_node import NodeType, WorkflowNode


class TestBaseModel:
    """Tests for BaseModel."""

    def test_generate_ulid(self):
        """Test ULID generation."""
        ulid1 = generate_ulid()
        ulid2 = generate_ulid()

        assert len(ulid1) == 26
        assert ulid1 != ulid2

    def test_model_timestamps(self):
        """Test automatic timestamps."""
        contact = Contact(
            workspace_id="ws-123",
            email="test@example.com",
        )

        assert contact.created_at is not None
        assert contact.updated_at is not None
        assert contact.version == 1

    def test_model_serialization(self):
        """Test DynamoDB serialization."""
        contact = Contact(
            id="contact-123",
            workspace_id="ws-456",
            email="test@example.com",
            first_name="John",
            tags=["lead", "newsletter"],
        )

        db_item = contact.to_dynamodb()

        assert db_item["id"] == "contact-123"
        assert db_item["workspace_id"] == "ws-456"
        assert db_item["email"] == "test@example.com"
        assert db_item["tags"] == ["lead", "newsletter"]
        assert isinstance(db_item["created_at"], str)

    def test_model_deserialization(self):
        """Test DynamoDB deserialization."""
        db_item = {
            "id": "contact-123",
            "workspace_id": "ws-456",
            "email": "test@example.com",
            "first_name": "John",
            "tags": ["lead"],
            "created_at": "2024-01-01T12:00:00+00:00",
            "updated_at": "2024-01-01T12:00:00+00:00",
            "version": 1,
        }

        contact = Contact.from_dynamodb(db_item)

        assert contact.id == "contact-123"
        assert contact.email == "test@example.com"
        assert isinstance(contact.created_at, datetime)


class TestContact:
    """Tests for Contact model."""

    def test_contact_creation(self):
        """Test contact creation."""
        contact = Contact(
            workspace_id="ws-123",
            email="test@example.com",
            first_name="John",
            last_name="Doe",
        )

        assert contact.workspace_id == "ws-123"
        assert contact.email == "test@example.com"
        assert contact.full_name == "John Doe"

    def test_contact_tags(self):
        """Test contact tag management."""
        contact = Contact(workspace_id="ws-123")

        contact.add_tag("lead")
        assert contact.has_tag("lead")

        contact.add_tag("NEWSLETTER")  # Should lowercase
        assert contact.has_tag("newsletter")

        contact.remove_tag("lead")
        assert not contact.has_tag("lead")

    def test_contact_keys(self):
        """Test DynamoDB key generation."""
        contact = Contact(
            id="contact-123",
            workspace_id="ws-456",
            email="test@example.com",
        )

        assert contact.get_pk() == "WS#ws-456"
        assert contact.get_sk() == "CONTACT#contact-123"

        gsi_keys = contact.get_gsi1_keys()
        assert gsi_keys["GSI1PK"] == "WS#ws-456#EMAIL"
        assert gsi_keys["GSI1SK"] == "test@example.com"

    def test_create_contact_request_validation(self):
        """Test contact request validation."""
        # Valid request
        request = CreateContactRequest(
            email="test@example.com",
            phone="+15551234567",
        )
        assert request.email == "test@example.com"

        # Invalid phone
        with pytest.raises(Exception):
            CreateContactRequest(phone="invalid")


class TestWorkflow:
    """Tests for Workflow model."""

    def test_workflow_creation(self, sample_workflow):
        """Test workflow creation."""
        assert sample_workflow.name == "Welcome Flow"
        assert sample_workflow.status == WorkflowStatus.ACTIVE
        assert len(sample_workflow.nodes) == 2
        assert len(sample_workflow.edges) == 1

    def test_workflow_graph_validation(self, sample_workflow):
        """Test workflow graph validation."""
        errors = sample_workflow.validate_graph()
        assert len(errors) == 0

    def test_workflow_invalid_graph(self):
        """Test validation of invalid workflow graph."""
        # Workflow with no trigger
        workflow = Workflow(
            workspace_id="ws-123",
            name="Invalid",
            nodes=[
                WorkflowNode(
                    id="action-1",
                    node_type="action_send_sms",
                    position={"x": 0, "y": 0},
                    data={},
                ),
            ],
            edges=[],
        )

        errors = workflow.validate_graph()
        assert len(errors) > 0
        assert "trigger" in errors[0].lower()

    def test_workflow_get_node_by_id(self, sample_workflow):
        """Test getting node by ID."""
        node = sample_workflow.get_node_by_id("trigger-1")
        assert node is not None
        assert node.node_type == "trigger_tag_added"

        missing = sample_workflow.get_node_by_id("nonexistent")
        assert missing is None

    def test_workflow_get_next_nodes(self, sample_workflow):
        """Test getting next nodes from edges."""
        next_nodes = sample_workflow.get_next_nodes("trigger-1")
        assert len(next_nodes) == 1
        assert next_nodes[0].id == "action-1"

    def test_workflow_keys(self, sample_workflow):
        """Test DynamoDB key generation."""
        assert sample_workflow.get_pk() == "WS#test-workspace-456"
        assert sample_workflow.get_sk() == "WF#test-workflow-789"


class TestWorkflowNode:
    """Tests for WorkflowNode model."""

    def test_node_types(self):
        """Test node type enum."""
        assert NodeType.TRIGGER_FORM_SUBMITTED.value == "trigger_form_submitted"
        assert NodeType.ACTION_SEND_SMS.value == "action_send_sms"
        assert NodeType.LOGIC_BRANCH.value == "logic_branch"
        assert NodeType.AI_DECISION.value == "ai_decision"

    def test_node_config(self):
        """Test node configuration."""
        node = WorkflowNode(
            id="node-1",
            node_type="action_send_sms",
            position={"x": 0, "y": 0},
            data={
                "label": "Send SMS",
                "config": {
                    "sms_message": "Hello {{contact.first_name}}!",
                },
            },
        )

        config = node.get_config()
        assert config["sms_message"] == "Hello {{contact.first_name}}!"
