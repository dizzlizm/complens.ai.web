"""Tests for workflow node implementations."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from complens.models.contact import Contact
from complens.models.workflow_run import WorkflowRun
from complens.nodes.base import NodeContext, NodeResult
from complens.nodes.actions import SendSmsAction, WaitAction, UpdateContactAction
from complens.nodes.logic import BranchNode, ABSplitNode
from complens.nodes.triggers import TagAddedTrigger


class TestNodeContext:
    """Tests for NodeContext."""

    def test_render_template_contact_fields(self, sample_contact):
        """Test template rendering with contact fields."""
        run = MagicMock(spec=WorkflowRun)
        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        result = context.render_template("Hello {{contact.first_name}}!")
        assert result == "Hello John!"

        result = context.render_template("{{contact.email}}")
        assert result == "test@example.com"

    def test_render_template_variables(self, sample_contact):
        """Test template rendering with variables."""
        run = MagicMock(spec=WorkflowRun)
        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
            variables={"order_id": "ORD-123", "amount": 99.99},
        )

        result = context.render_template("Order {{order_id}} for ${{amount}}")
        assert result == "Order ORD-123 for $99.99"

    def test_render_template_trigger_data(self, sample_contact):
        """Test template rendering with trigger data."""
        run = MagicMock(spec=WorkflowRun)
        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
            trigger_data={"form_name": "Contact Form"},
        )

        result = context.render_template("Submitted: {{trigger.form_name}}")
        assert result == "Submitted: Contact Form"


class TestTriggerNodes:
    """Tests for trigger node implementations."""

    @pytest.mark.asyncio
    async def test_tag_added_trigger(self, sample_contact):
        """Test tag added trigger execution."""
        run = MagicMock(spec=WorkflowRun)
        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
            trigger_data={
                "tag": "hot-lead",
                "operation": "added",
                "previous_tags": [],
                "current_tags": ["hot-lead"],
            },
        )

        trigger = TagAddedTrigger(
            node_id="trigger-1",
            config={"tag_name": "hot-lead"},
        )

        result = await trigger.execute(context)

        assert result.success
        assert result.output["tag"] == "hot-lead"
        assert result.output["operation"] == "added"


class TestActionNodes:
    """Tests for action node implementations."""

    @pytest.mark.asyncio
    async def test_send_sms_action(self, sample_contact):
        """Test SMS sending action."""
        run = MagicMock(spec=WorkflowRun)
        run.id = "run-123"

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        action = SendSmsAction(
            node_id="action-1",
            config={
                "sms_message": "Hi {{contact.first_name}}, welcome!",
            },
        )

        result = await action.execute(context)

        assert result.success
        assert result.output["to"] == "+15551234567"
        assert "John" in result.output["body"]

    @pytest.mark.asyncio
    async def test_send_sms_no_phone(self, sample_contact):
        """Test SMS action fails without phone."""
        sample_contact.phone = None
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        action = SendSmsAction(
            node_id="action-1",
            config={"sms_message": "Hello!"},
        )

        result = await action.execute(context)

        assert not result.success
        assert "phone" in result.error.lower()

    @pytest.mark.asyncio
    async def test_wait_action_duration(self, sample_contact):
        """Test wait action with duration."""
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        action = WaitAction(
            node_id="action-1",
            config={"wait_duration": 3600},
        )

        result = await action.execute(context)

        assert result.success
        assert result.status == "waiting"
        assert result.wait_seconds == 3600

    @pytest.mark.asyncio
    async def test_update_contact_action(self, sample_contact):
        """Test contact update action."""
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        action = UpdateContactAction(
            node_id="action-1",
            config={
                "add_tags": ["customer", "verified"],
                "remove_tags": ["lead"],
                "update_fields": {"first_name": "Jonathan"},
            },
        )

        with patch("complens.repositories.contact.ContactRepository") as mock_repo_cls:
            mock_repo_cls.return_value.update_contact.return_value = sample_contact
            result = await action.execute(context)

        assert result.success
        assert sample_contact.has_tag("customer")
        assert sample_contact.has_tag("verified")
        assert not sample_contact.has_tag("lead")
        assert sample_contact.first_name == "Jonathan"
        mock_repo_cls.return_value.update_contact.assert_called_once_with(sample_contact)


class TestLogicNodes:
    """Tests for logic node implementations."""

    @pytest.mark.asyncio
    async def test_branch_node_condition_match(self, sample_contact):
        """Test branch node with matching condition."""
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
            variables={"score": 85},
        )

        branch = BranchNode(
            node_id="branch-1",
            config={
                "conditions": [
                    {
                        "field": "variables.score",
                        "operator": "greater_than",
                        "value": 80,
                        "output_handle": "high",
                    },
                    {
                        "field": "variables.score",
                        "operator": "greater_than",
                        "value": 50,
                        "output_handle": "medium",
                    },
                ],
                "default_output": "low",
            },
        )

        result = await branch.execute(context)

        assert result.success
        assert result.next_node_id == "high"

    @pytest.mark.asyncio
    async def test_branch_node_default(self, sample_contact):
        """Test branch node falls through to default."""
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
            variables={"score": 20},
        )

        branch = BranchNode(
            node_id="branch-1",
            config={
                "conditions": [
                    {
                        "field": "variables.score",
                        "operator": "greater_than",
                        "value": 50,
                        "output_handle": "high",
                    },
                ],
                "default_output": "low",
            },
        )

        result = await branch.execute(context)

        assert result.success
        assert result.next_node_id == "low"

    @pytest.mark.asyncio
    async def test_ab_split_distribution(self, sample_contact):
        """Test A/B split produces both outcomes over many runs."""
        run = MagicMock(spec=WorkflowRun)

        context = NodeContext(
            contact=sample_contact,
            workflow_run=run,
            workspace_id="ws-123",
        )

        split = ABSplitNode(
            node_id="split-1",
            config={
                "split_percentages": {"a": 50, "b": 50},
            },
        )

        # Run multiple times and check distribution
        results = {"a": 0, "b": 0}
        for _ in range(100):
            result = await split.execute(context)
            results[result.next_node_id] += 1

        # Both should have some hits (probabilistic, but very unlikely to fail)
        assert results["a"] > 0
        assert results["b"] > 0
