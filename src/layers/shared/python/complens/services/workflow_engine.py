"""Workflow execution engine.

Handles the execution of workflow definitions, traversing the graph
and executing nodes in sequence.

Supports both legacy node types (action_send_sms) and new provider-based
nodes (twilio.send_sms) through the provider registry system.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog

from complens.models.contact import Contact
from complens.models.conversation import Conversation
from complens.models.workflow import Workflow
from complens.models.workflow_node import NodeType
from complens.models.workflow_run import RunStatus, StepStatus, WorkflowRun, WorkflowStep
from complens.nodes.actions import ACTION_NODES
from complens.nodes.ai_nodes import AI_NODES
from complens.nodes.base import BaseNode, NodeContext, NodeResult
from complens.nodes.logic import LOGIC_NODES
from complens.nodes.triggers import TRIGGER_NODES
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository, WorkflowStepRepository

logger = structlog.get_logger()

# Combined legacy node registry (built-in node types)
NODE_REGISTRY: dict[str, type[BaseNode]] = {
    **TRIGGER_NODES,
    **ACTION_NODES,
    **LOGIC_NODES,
    **AI_NODES,
}


def _get_node_for_type(
    node_id: str,
    node_type: str,
    config: dict[str, Any],
) -> BaseNode | None:
    """Get the appropriate node implementation for a node type.

    Supports both legacy node types and new provider.action format.
    Falls back to legacy node registry if not a provider-based type.

    Args:
        node_id: Node ID.
        node_type: Node type string.
        config: Node configuration.

    Returns:
        BaseNode implementation or None if not found.
    """
    # Import here to avoid circular imports
    from complens.integrations.legacy_adapter import get_node_for_type

    # Try provider-based nodes first (provider.action format or legacy adapter)
    provider_node = get_node_for_type(node_id, node_type, config)
    if provider_node:
        return provider_node

    # Fall back to legacy node registry
    node_class = NODE_REGISTRY.get(node_type)
    if node_class:
        return node_class(node_id=node_id, config=config)

    return None


class WorkflowEngine:
    """Engine for executing marketing automation workflows.

    Handles workflow execution, step tracking, and real-time updates.
    """

    def __init__(
        self,
        workflow_repo: WorkflowRepository | None = None,
        run_repo: WorkflowRunRepository | None = None,
        step_repo: WorkflowStepRepository | None = None,
    ):
        """Initialize the workflow engine.

        Args:
            workflow_repo: Repository for workflows.
            run_repo: Repository for workflow runs.
            step_repo: Repository for workflow steps.
        """
        self.workflow_repo = workflow_repo or WorkflowRepository()
        self.run_repo = run_repo or WorkflowRunRepository()
        self.step_repo = step_repo or WorkflowStepRepository()
        self.logger = logger.bind(service="workflow_engine")

    async def start_workflow(
        self,
        workflow: Workflow,
        contact: Contact,
        trigger_type: str,
        trigger_data: dict[str, Any],
        conversation: Conversation | None = None,
    ) -> WorkflowRun:
        """Start a new workflow execution.

        Args:
            workflow: The workflow definition.
            contact: The contact to run for.
            trigger_type: Type of trigger that started this.
            trigger_data: Data from the trigger event.
            conversation: Optional conversation context.

        Returns:
            The created WorkflowRun.
        """
        self.logger.info(
            "Starting workflow",
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            contact_id=contact.id,
            trigger_type=trigger_type,
        )

        # Validate workflow is active
        if workflow.status.value != "active":
            raise ValueError(f"Workflow is not active (status: {workflow.status})")

        # Validate workflow graph
        errors = workflow.validate_graph()
        if errors:
            raise ValueError(f"Invalid workflow: {', '.join(errors)}")

        # Create workflow run
        run = WorkflowRun(
            workflow_id=workflow.id,
            workspace_id=workflow.workspace_id,
            contact_id=contact.id,
            trigger_type=trigger_type,
            trigger_data=trigger_data,
            status=RunStatus.PENDING,
        )

        run = self.run_repo.create_run(run)

        # Start execution
        run.start()
        run = self.run_repo.update_run(run)

        # Get trigger node and start execution
        trigger_node = workflow.get_trigger_node()
        if not trigger_node:
            run.complete(success=False, error_message="No trigger node found")
            self.run_repo.update_run(run)
            return run

        # Execute the workflow
        try:
            await self._execute_from_node(
                workflow=workflow,
                run=run,
                contact=contact,
                conversation=conversation,
                current_node_id=trigger_node.id,
                variables={},
                trigger_data=trigger_data,
                step_sequence=0,
            )

            # Mark as completed
            run.complete(success=True)
            self.run_repo.update_run(run)

        except Exception as e:
            self.logger.exception("Workflow execution failed", error=str(e))
            run.complete(success=False, error_message=str(e))
            self.run_repo.update_run(run)

        return run

    async def _execute_from_node(
        self,
        workflow: Workflow,
        run: WorkflowRun,
        contact: Contact,
        conversation: Conversation | None,
        current_node_id: str,
        variables: dict[str, Any],
        trigger_data: dict[str, Any],
        step_sequence: int,
    ) -> None:
        """Execute workflow starting from a specific node.

        This is a recursive function that traverses the workflow graph.

        Args:
            workflow: The workflow definition.
            run: The workflow run.
            contact: The contact.
            conversation: Optional conversation.
            current_node_id: ID of node to execute.
            variables: Variables accumulated so far.
            trigger_data: Original trigger data.
            step_sequence: Current step number.
        """
        # Get the node definition
        node_def = workflow.get_node_by_id(current_node_id)
        if not node_def:
            self.logger.error("Node not found", node_id=current_node_id)
            return

        # Get node implementation (supports both legacy and provider-based nodes)
        node = _get_node_for_type(
            node_id=current_node_id,
            node_type=node_def.node_type,
            config=node_def.get_config(),
        )
        if not node:
            self.logger.error("Unknown node type", node_type=node_def.node_type)
            return

        # Create step record
        step = WorkflowStep(
            run_id=run.id,
            node_id=current_node_id,
            node_type=node_def.node_type,
            sequence=step_sequence,
            input_data={"variables": variables},
        )
        step.start()

        try:
            # Node instance already created by _get_node_for_type

            # Build execution context
            context = NodeContext(
                contact=contact,
                workflow_run=run,
                conversation=conversation,
                workspace_id=workflow.workspace_id,
                variables=variables.copy(),
                trigger_data=trigger_data,
                node_config=node_def.get_config(),
            )

            # Execute the node
            self.logger.info(
                "Executing node",
                node_id=current_node_id,
                node_type=node_def.node_type,
                step=step_sequence,
            )

            result = await node.execute(context)

            # Handle result
            if result.success:
                # Merge output variables
                merged_vars = {**variables, **result.variables, **result.output}

                step.complete(
                    success=True,
                    output=result.output,
                    next_node_id=result.next_node_id,
                )
                self.step_repo.create_step(step)

                # Handle waiting state
                if result.status == "waiting":
                    run.wait(result.wait_until or datetime.now(timezone.utc))
                    run.current_node_id = result.next_node_id
                    run.variables = merged_vars
                    self.run_repo.update_run(run)
                    # Execution will resume via Step Functions
                    return

                # Determine next node
                next_node_id = result.next_node_id
                if not next_node_id:
                    # No explicit next, try to find from edges
                    edges = workflow.get_outgoing_edges(current_node_id)
                    if edges:
                        # For non-branching nodes, take the first edge
                        next_node_id = edges[0].target

                if next_node_id:
                    # Continue to next node
                    await self._execute_from_node(
                        workflow=workflow,
                        run=run,
                        contact=contact,
                        conversation=conversation,
                        current_node_id=next_node_id,
                        variables=merged_vars,
                        trigger_data=trigger_data,
                        step_sequence=step_sequence + 1,
                    )
                # else: end of workflow path

            else:
                # Node failed
                step.complete(
                    success=False,
                    error_message=result.error,
                )
                self.step_repo.create_step(step)

                run.error_message = result.error
                run.error_node_id = current_node_id
                raise Exception(result.error)

        except Exception as e:
            if not step.completed_at:
                step.complete(success=False, error_message=str(e))
                self.step_repo.create_step(step)
            raise

    async def resume_after_wait(
        self,
        run_id: str,
        workflow_id: str,
        workspace_id: str,
    ) -> WorkflowRun:
        """Resume workflow execution after a wait.

        Args:
            run_id: The run ID.
            workflow_id: The workflow ID.
            workspace_id: The workspace ID.

        Returns:
            Updated WorkflowRun.
        """
        # Get run and workflow
        run = self.run_repo.get_by_id(workflow_id, run_id)
        if not run:
            raise ValueError(f"Run {run_id} not found")

        workflow = self.workflow_repo.get_by_id(workspace_id, workflow_id)
        if not workflow:
            raise ValueError(f"Workflow {workflow_id} not found")

        # Get contact - would need ContactRepository
        # For now, create minimal contact from run
        from complens.models.contact import Contact

        contact = Contact(
            id=run.contact_id,
            workspace_id=workspace_id,
        )

        # Resume execution
        run.status = RunStatus.RUNNING
        self.run_repo.update_run(run)

        # Get last step to determine where to resume
        steps = self.step_repo.list_by_run(run_id)
        last_step = steps[-1] if steps else None
        step_sequence = (last_step.sequence + 1) if last_step else 0

        next_node_id = run.current_node_id
        if not next_node_id and last_step:
            next_node_id = last_step.next_node_id

        if next_node_id:
            await self._execute_from_node(
                workflow=workflow,
                run=run,
                contact=contact,
                conversation=None,
                current_node_id=next_node_id,
                variables=run.variables,
                trigger_data=run.trigger_data,
                step_sequence=step_sequence,
            )

        run.complete(success=True)
        self.run_repo.update_run(run)

        return run

    def get_node_class(self, node_type: str) -> type[BaseNode] | None:
        """Get the node class for a legacy node type.

        Args:
            node_type: Node type string.

        Returns:
            Node class or None if not found.

        Note:
            For provider-based nodes, use _get_node_for_type() instead.
        """
        return NODE_REGISTRY.get(node_type)

    def get_node_instance(
        self,
        node_id: str,
        node_type: str,
        config: dict[str, Any],
    ) -> BaseNode | None:
        """Get a node instance for a node type.

        Supports both legacy and provider-based node types.

        Args:
            node_id: Node ID.
            node_type: Node type string.
            config: Node configuration.

        Returns:
            Node instance or None if not found.
        """
        return _get_node_for_type(node_id, node_type, config)

    def validate_workflow(self, workflow: Workflow) -> list[str]:
        """Validate a workflow definition.

        Supports both legacy and provider-based node types.

        Args:
            workflow: Workflow to validate.

        Returns:
            List of validation errors.
        """
        errors = workflow.validate_graph()

        # Validate each node's configuration
        for node_def in workflow.nodes:
            node = _get_node_for_type(
                node_id=node_def.id,
                node_type=node_def.node_type,
                config=node_def.get_config(),
            )

            if not node:
                # Check if it's a provider-based node that might not be loaded
                if "." in node_def.node_type:
                    # Provider-based node - validate through registry
                    from complens.integrations.registry import get_provider_registry

                    registry = get_provider_registry()
                    parts = node_def.node_type.split(".", 1)
                    if len(parts) == 2:
                        provider_id, action_id = parts
                        try:
                            provider = registry.get_provider(provider_id)
                            action_errors = provider.validate_action_config(
                                action_id, node_def.get_config()
                            )
                            for err in action_errors:
                                errors.append(f"Node '{node_def.label}': {err}")
                            continue
                        except Exception as e:
                            errors.append(f"Unknown provider: {provider_id}")
                            continue

                errors.append(f"Unknown node type: {node_def.node_type}")
                continue

            node_errors = node.validate_config()
            for err in node_errors:
                errors.append(f"Node '{node_def.label}': {err}")

        return errors
