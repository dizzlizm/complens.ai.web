"""Workflow model for visual automation builder."""

from enum import Enum
from typing import Any, ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel
from complens.models.workflow_node import WorkflowNode


class WorkflowStatus(str, Enum):
    """Workflow status enum."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class WorkflowEdge(PydanticBaseModel):
    """Edge connecting two nodes in the workflow graph.

    Compatible with React Flow edge format.
    """

    id: str = Field(..., description="Unique edge ID")
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    source_handle: str | None = Field(None, description="Source handle ID for multiple outputs")
    target_handle: str | None = Field(None, description="Target handle ID for multiple inputs")
    label: str | None = Field(None, description="Edge label for conditional branches")
    data: dict = Field(default_factory=dict, description="Additional edge data")


class TriggerConfig(PydanticBaseModel):
    """Configuration for how the workflow is triggered."""

    trigger_node_id: str = Field(..., description="ID of the trigger node")
    trigger_type: str = Field(..., description="Type of trigger")

    # Form trigger
    form_id: str | None = None

    # Tag trigger
    tag_name: str | None = None

    # Schedule trigger (cron)
    cron_expression: str | None = None
    timezone: str = Field(default="UTC")

    # Webhook trigger
    webhook_path: str | None = None

    # Additional config
    config: dict = Field(default_factory=dict)


class Workflow(BaseModel):
    """Workflow entity - represents a visual automation workflow.

    Workflows can be:
    - Workspace-level: page_id is None, shown in global Workflows page
    - Page-specific: page_id is set, shown in page editor

    Key Pattern:
        PK: WS#{workspace_id}
        SK: WF#{id}
        GSI1PK: WS#{workspace_id}#WF_STATUS
        GSI1SK: {status}#{id}
        GSI2PK: PAGE#{page_id}#WORKFLOWS (if page_id set)
        GSI2SK: {status}#{id}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "WF#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    page_id: str | None = Field(None, description="Parent page ID (None for workspace-level workflows)")

    # Workflow metadata
    name: str = Field(..., min_length=1, max_length=255, description="Workflow name")
    description: str | None = Field(None, max_length=1000, description="Workflow description")
    status: WorkflowStatus = Field(default=WorkflowStatus.DRAFT, description="Workflow status")

    # Visual builder data (React Flow compatible)
    nodes: list[WorkflowNode] = Field(default_factory=list, description="Workflow nodes")
    edges: list[WorkflowEdge] = Field(default_factory=list, description="Node connections")
    viewport: dict = Field(
        default_factory=lambda: {"x": 0, "y": 0, "zoom": 1},
        description="Canvas viewport state",
    )

    # Trigger configuration
    trigger_config: TriggerConfig | None = Field(None, description="Trigger configuration")

    # Execution stats
    total_runs: int = Field(default=0, description="Total execution count")
    successful_runs: int = Field(default=0, description="Successful execution count")
    failed_runs: int = Field(default=0, description="Failed execution count")
    last_run_at: str | None = Field(None, description="Last execution timestamp")

    # Settings
    settings: dict = Field(
        default_factory=lambda: {
            "max_concurrent_runs": 100,
            "timeout_minutes": 60,
            "retry_on_failure": True,
            "max_retries": 3,
        },
        description="Workflow settings",
    )

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: WF#{id}."""
        return f"WF#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for status filtering."""
        # Handle status as string or enum (DynamoDB stores as string)
        status_value = self.status.value if hasattr(self.status, 'value') else self.status
        return {
            "GSI1PK": f"WS#{self.workspace_id}#WF_STATUS",
            "GSI1SK": f"{status_value}#{self.id}",
        }

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """Get GSI2 keys for page-scoped workflow listing (if page_id set)."""
        if not self.page_id:
            return None
        status_value = self.status.value if hasattr(self.status, 'value') else self.status
        return {
            "GSI2PK": f"PAGE#{self.page_id}#WORKFLOWS",
            "GSI2SK": f"{status_value}#{self.id}",
        }

    def get_node_by_id(self, node_id: str) -> WorkflowNode | None:
        """Get a node by its ID."""
        for node in self.nodes:
            if node.id == node_id:
                return node
        return None

    def get_trigger_node(self) -> WorkflowNode | None:
        """Get the trigger node (first node with trigger type)."""
        for node in self.nodes:
            if node.node_type.startswith("trigger_"):
                return node
        return None

    def get_next_nodes(self, node_id: str) -> list[WorkflowNode]:
        """Get nodes connected as targets from the given node."""
        next_node_ids = [edge.target for edge in self.edges if edge.source == node_id]
        return [node for node in self.nodes if node.id in next_node_ids]

    def get_outgoing_edges(self, node_id: str) -> list[WorkflowEdge]:
        """Get all edges going out from a node."""
        return [edge for edge in self.edges if edge.source == node_id]

    def validate_graph(self) -> list[str]:
        """Validate the workflow graph structure.

        Returns a list of validation errors, empty if valid.
        """
        errors = []

        # Check for trigger node
        trigger_nodes = [n for n in self.nodes if n.node_type.startswith("trigger_")]
        if not trigger_nodes:
            errors.append("Workflow must have at least one trigger node")
        elif len(trigger_nodes) > 1:
            errors.append("Workflow can only have one trigger node")

        # Check for orphan nodes (no incoming or outgoing edges, except trigger)
        node_ids = {n.id for n in self.nodes}
        connected_as_source = {e.source for e in self.edges}
        connected_as_target = {e.target for e in self.edges}

        for node in self.nodes:
            if node.node_type.startswith("trigger_"):
                continue  # Trigger doesn't need incoming edges
            if node.id not in connected_as_target:
                errors.append(f"Node '{node.data.get('label', node.id)}' has no incoming edges")

        # Check for invalid edge references
        for edge in self.edges:
            if edge.source not in node_ids:
                errors.append(f"Edge references non-existent source node: {edge.source}")
            if edge.target not in node_ids:
                errors.append(f"Edge references non-existent target node: {edge.target}")

        return errors

    def to_react_flow(self) -> dict[str, Any]:
        """Export workflow in React Flow compatible format."""
        return {
            "nodes": [node.model_dump(by_alias=True) for node in self.nodes],
            "edges": [edge.model_dump(by_alias=True) for edge in self.edges],
            "viewport": self.viewport,
        }


class CreateWorkflowRequest(PydanticBaseModel):
    """Request model for creating a workflow."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    viewport: dict = Field(default_factory=lambda: {"x": 0, "y": 0, "zoom": 1})
    settings: dict = Field(default_factory=dict)


class UpdateWorkflowRequest(PydanticBaseModel):
    """Request model for updating a workflow."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    status: WorkflowStatus | None = None
    nodes: list[dict] | None = None
    edges: list[dict] | None = None
    viewport: dict | None = None
    trigger_config: dict | None = None
    settings: dict | None = None
