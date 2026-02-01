"""Base classes for workflow nodes."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import structlog

from complens.models.contact import Contact
from complens.models.conversation import Conversation
from complens.models.workflow_run import WorkflowRun

logger = structlog.get_logger()


@dataclass
class NodeContext:
    """Context passed to node during execution.

    Contains all data needed for a node to execute.
    """

    # Core entities
    contact: Contact
    workflow_run: WorkflowRun
    conversation: Conversation | None = None

    # Workspace context
    workspace_id: str = ""

    # Variables passed between nodes
    variables: dict[str, Any] = field(default_factory=dict)

    # Trigger data (only available in first node after trigger)
    trigger_data: dict[str, Any] = field(default_factory=dict)

    # Node configuration
    node_config: dict[str, Any] = field(default_factory=dict)

    def get_variable(self, name: str, default: Any = None) -> Any:
        """Get a variable by name.

        Args:
            name: Variable name.
            default: Default value if not found.

        Returns:
            Variable value or default.
        """
        return self.variables.get(name, default)

    def set_variable(self, name: str, value: Any) -> None:
        """Set a variable.

        Args:
            name: Variable name.
            value: Variable value.
        """
        self.variables[name] = value

    def render_template(self, template: str) -> str:
        """Render a template string with variable substitution.

        Supports {{variable}} and {{contact.field}} syntax.

        Args:
            template: Template string.

        Returns:
            Rendered string.
        """
        import re

        def replace_var(match: re.Match) -> str:
            var_path = match.group(1).strip()

            # Handle contact fields
            if var_path.startswith("contact."):
                field_name = var_path[8:]  # Remove "contact."
                if hasattr(self.contact, field_name):
                    value = getattr(self.contact, field_name)
                    return str(value) if value is not None else ""
                return ""

            # Handle trigger data
            if var_path.startswith("trigger."):
                key = var_path[8:]  # Remove "trigger."
                return str(self.trigger_data.get(key, ""))

            # Handle regular variables
            return str(self.variables.get(var_path, ""))

        pattern = r"\{\{([^}]+)\}\}"
        return re.sub(pattern, replace_var, template)


@dataclass
class NodeResult:
    """Result returned from node execution."""

    # Execution status
    success: bool = True
    status: str = "completed"  # completed, waiting, error

    # Output data to pass to next nodes
    output: dict[str, Any] = field(default_factory=dict)

    # Next node to execute (for branching)
    next_node_id: str | None = None

    # Updated variables
    variables: dict[str, Any] = field(default_factory=dict)

    # Error information
    error: str | None = None
    error_details: dict | None = None

    # Wait information (for wait nodes)
    wait_seconds: int | None = None
    wait_until: datetime | None = None

    @classmethod
    def completed(
        cls,
        output: dict | None = None,
        next_node_id: str | None = None,
        variables: dict | None = None,
    ) -> "NodeResult":
        """Create a successful completion result.

        Args:
            output: Output data.
            next_node_id: Next node to execute.
            variables: Updated variables.

        Returns:
            NodeResult instance.
        """
        return cls(
            success=True,
            status="completed",
            output=output or {},
            next_node_id=next_node_id,
            variables=variables or {},
        )

    @classmethod
    def waiting(
        cls,
        wait_seconds: int | None = None,
        wait_until: datetime | None = None,
        next_node_id: str | None = None,
        variables: dict | None = None,
    ) -> "NodeResult":
        """Create a waiting result.

        Args:
            wait_seconds: Seconds to wait.
            wait_until: Datetime to wait until.
            next_node_id: Node to execute after wait.
            variables: Variables to preserve.

        Returns:
            NodeResult instance.
        """
        return cls(
            success=True,
            status="waiting",
            wait_seconds=wait_seconds,
            wait_until=wait_until,
            next_node_id=next_node_id,
            variables=variables or {},
        )

    @classmethod
    def failed(
        cls,
        error: str,
        error_details: dict | None = None,
    ) -> "NodeResult":
        """Create a failure result.

        Args:
            error: Error message.
            error_details: Additional error details.

        Returns:
            NodeResult instance.
        """
        return cls(
            success=False,
            status="error",
            error=error,
            error_details=error_details,
        )


class BaseNode(ABC):
    """Abstract base class for all workflow nodes.

    Each node type should inherit from this class and implement
    the execute method.
    """

    # Node type identifier (must match NodeType enum)
    node_type: str = ""

    def __init__(self, node_id: str, config: dict[str, Any]):
        """Initialize node.

        Args:
            node_id: Unique node ID within the workflow.
            config: Node configuration from workflow definition.
        """
        self.node_id = node_id
        self.config = config
        self.logger = logger.bind(node_id=node_id, node_type=self.node_type)

    @abstractmethod
    async def execute(self, context: NodeContext) -> NodeResult:
        """Execute the node.

        Args:
            context: Execution context with contact, variables, etc.

        Returns:
            NodeResult with success/failure and output.
        """
        pass

    def validate_config(self) -> list[str]:
        """Validate node configuration.

        Returns:
            List of validation error messages, empty if valid.
        """
        return []

    def get_output_schema(self) -> dict[str, Any]:
        """Get the schema for this node's output.

        Returns:
            JSON schema for output data.
        """
        return {"type": "object"}

    def get_required_config(self) -> list[str]:
        """Get list of required configuration fields.

        Returns:
            List of required field names.
        """
        return []

    def _get_config_value(self, key: str, default: Any = None) -> Any:
        """Get a configuration value.

        Args:
            key: Configuration key.
            default: Default value if not found.

        Returns:
            Configuration value.
        """
        return self.config.get(key, default)
