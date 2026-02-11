"""Deal model for CRM pipeline management."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class DealPriority(str, Enum):
    """Deal priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


DEFAULT_PIPELINE_STAGES = [
    "New Lead",
    "Qualified",
    "Proposal",
    "Negotiation",
    "Won",
    "Lost",
]


class Deal(BaseModel):
    """Deal entity - represents a sales deal in the pipeline.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: DEAL#{id}
        GSI1PK: WS#{workspace_id}#DEALS
        GSI1SK: {stage}#{created_at}
        GSI2PK: CONTACT#{contact_id}  (if contact_id set)
        GSI2SK: DEAL#{created_at}     (if contact_id set)
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "DEAL#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    title: str = Field(..., max_length=255, description="Deal title")
    value: float = Field(default=0.0, description="Deal value in dollars")
    stage: str = Field(default="New Lead", description="Pipeline stage")
    contact_id: str | None = Field(None, description="Linked contact ID")
    contact_name: str | None = Field(None, description="Denormalized contact name for display")
    owner_id: str | None = Field(None, description="Deal owner user ID")
    owner_name: str | None = Field(None, description="Denormalized owner name")
    description: str | None = Field(None, description="Deal description")
    priority: DealPriority = Field(default=DealPriority.MEDIUM, description="Deal priority")
    expected_close_date: str | None = Field(None, description="Expected close date (ISO format)")
    tags: list[str] = Field(default_factory=list, description="Deal tags")
    custom_fields: dict = Field(default_factory=dict, description="Custom field values")
    lost_reason: str | None = Field(None, description="Reason for losing the deal")
    position: int = Field(default=0, description="Order position within stage column")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: DEAL#{id}."""
        return f"DEAL#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for stage-based queries."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#DEALS",
            "GSI1SK": f"{self.stage}#{self.created_at.isoformat()}",
        }

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """Get GSI2 keys for contact-based queries (if contact linked)."""
        if self.contact_id:
            return {
                "GSI2PK": f"CONTACT#{self.contact_id}",
                "GSI2SK": f"DEAL#{self.created_at.isoformat()}",
            }
        return None


class CreateDealRequest(PydanticBaseModel):
    """Request model for creating a deal."""

    title: str = Field(..., min_length=1, max_length=255)
    value: float = Field(default=0.0, ge=0)
    stage: str = Field(default="New Lead")
    contact_id: str | None = None
    contact_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str | None = None
    priority: DealPriority = DealPriority.MEDIUM
    expected_close_date: str | None = None
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    position: int = 0


class UpdateDealRequest(PydanticBaseModel):
    """Request model for updating a deal."""

    title: str | None = Field(None, min_length=1, max_length=255)
    value: float | None = Field(None, ge=0)
    stage: str | None = None
    contact_id: str | None = None
    contact_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str | None = None
    priority: DealPriority | None = None
    expected_close_date: str | None = None
    tags: list[str] | None = None
    custom_fields: dict | None = None
    lost_reason: str | None = None
    position: int | None = None


class MoveDealRequest(PydanticBaseModel):
    """Request model for moving a deal to a new stage."""

    stage: str = Field(..., min_length=1)
    position: int = Field(default=0, ge=0)
