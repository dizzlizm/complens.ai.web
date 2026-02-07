"""Workflow run and step models for execution tracking."""

from datetime import datetime
from enum import Enum
from typing import Any, ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel, generate_ulid, utc_now


class RunStatus(str, Enum):
    """Workflow run status enum."""

    PENDING = "pending"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepStatus(str, Enum):
    """Workflow step status enum."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class WorkflowRun(BaseModel):
    """Workflow run entity - represents a single execution of a workflow.

    Key Pattern:
        PK: WF#{workflow_id}
        SK: RUN#{id}
        GSI1PK: CONTACT#{contact_id}
        GSI1SK: RUN#{created_at}
    """

    _pk_prefix: ClassVar[str] = "WF#"
    _sk_prefix: ClassVar[str] = "RUN#"

    workflow_id: str = Field(..., description="Parent workflow ID")
    workspace_id: str = Field(..., description="Workspace ID for denormalization")
    contact_id: str | None = Field(None, description="Contact this run is for (may be None for form triggers without contacts)")

    # Run state
    status: RunStatus = Field(default=RunStatus.PENDING, description="Current run status")
    current_node_id: str | None = Field(None, description="Currently executing node")

    # Trigger information
    trigger_type: str = Field(..., description="What triggered this run")
    trigger_data: dict = Field(default_factory=dict, description="Data from trigger event")

    # Execution context
    variables: dict[str, Any] = Field(
        default_factory=dict, description="Variables passed between nodes"
    )

    # Timing
    started_at: datetime | None = Field(None, description="When execution started")
    completed_at: datetime | None = Field(None, description="When execution completed")
    waiting_until: datetime | None = Field(None, description="If waiting, until when")

    # Results
    error_message: str | None = Field(None, description="Error message if failed")
    error_node_id: str | None = Field(None, description="Node that caused failure")
    steps_completed: int = Field(default=0, description="Number of steps completed")

    # Step Functions integration
    step_function_execution_arn: str | None = Field(None, description="Step Functions ARN")

    def get_pk(self) -> str:
        """Get partition key: WF#{workflow_id}."""
        return f"WF#{self.workflow_id}"

    def get_sk(self) -> str:
        """Get sort key: RUN#{id}."""
        return f"RUN#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for contact run history."""
        return {
            "GSI1PK": f"CONTACT#{self.contact_id}",
            "GSI1SK": f"RUN#{self.created_at.isoformat()}",
        }

    def start(self) -> None:
        """Mark the run as started."""
        self.status = RunStatus.RUNNING
        self.started_at = utc_now()

    def complete(self, success: bool = True, error_message: str | None = None) -> None:
        """Mark the run as completed."""
        self.status = RunStatus.COMPLETED if success else RunStatus.FAILED
        self.completed_at = utc_now()
        if error_message:
            self.error_message = error_message

    def wait(self, until: datetime) -> None:
        """Put the run in waiting state."""
        self.status = RunStatus.WAITING
        self.waiting_until = until

    def cancel(self) -> None:
        """Cancel the run."""
        self.status = RunStatus.CANCELLED
        self.completed_at = utc_now()


class WorkflowStep(PydanticBaseModel):
    """Individual step execution within a workflow run.

    Key Pattern:
        PK: RUN#{run_id}
        SK: STEP#{sequence}#{id}
    """

    id: str = Field(default_factory=generate_ulid, description="Step ID")
    run_id: str = Field(..., description="Parent run ID")
    node_id: str = Field(..., description="Workflow node ID")
    node_type: str = Field(..., description="Node type")

    # Execution
    sequence: int = Field(..., description="Execution order")
    status: StepStatus = Field(default=StepStatus.PENDING, description="Step status")

    # Timing
    started_at: datetime | None = Field(None, description="When step started")
    completed_at: datetime | None = Field(None, description="When step completed")
    duration_ms: int | None = Field(None, description="Execution duration in milliseconds")

    # Input/Output
    input_data: dict = Field(default_factory=dict, description="Input to the step")
    output_data: dict = Field(default_factory=dict, description="Output from the step")

    # Results
    success: bool = Field(default=True, description="Whether step succeeded")
    error_message: str | None = Field(None, description="Error if failed")
    next_node_id: str | None = Field(None, description="Next node to execute")

    # Timestamps
    created_at: datetime = Field(default_factory=utc_now)

    def get_pk(self) -> str:
        """Get partition key: RUN#{run_id}."""
        return f"RUN#{self.run_id}"

    def get_sk(self) -> str:
        """Get sort key: STEP#{sequence}#{id}."""
        return f"STEP#{self.sequence:06d}#{self.id}"

    def start(self) -> None:
        """Mark step as started."""
        self.status = StepStatus.RUNNING
        self.started_at = utc_now()

    def complete(
        self,
        success: bool = True,
        output: dict | None = None,
        next_node_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        """Mark step as completed."""
        self.status = StepStatus.COMPLETED if success else StepStatus.FAILED
        self.success = success
        self.completed_at = utc_now()

        if self.started_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)

        if output:
            self.output_data = output
        if next_node_id:
            self.next_node_id = next_node_id
        if error_message:
            self.error_message = error_message

    def to_dynamodb(self) -> dict[str, Any]:
        """Serialize to DynamoDB item format."""
        data = self.model_dump(mode="json")
        # Convert datetimes
        for field in ["started_at", "completed_at", "created_at"]:
            if data.get(field):
                if isinstance(data[field], datetime):
                    data[field] = data[field].isoformat()
        return {k: v for k, v in data.items() if v is not None}
