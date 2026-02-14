"""Partner model for referral/channel partner tracking."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class PartnerPriority(str, Enum):
    """Partner priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class PartnerType(str, Enum):
    """Partner types."""

    MSP = "msp"
    REFERRAL = "referral"
    AGENCY = "agency"
    AFFILIATE = "affiliate"
    OTHER = "other"


DEFAULT_PARTNER_STAGES = [
    "Prospect",
    "Introduced",
    "Negotiating",
    "Active",
    "Inactive",
]


class Partner(BaseModel):
    """Partner entity - represents a referral/channel partner.

    Tracks first-degree network relationships, who introduced whom,
    and commission percentages for partner referrals.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: PARTNER#{id}
        GSI1PK: WS#{workspace_id}#PARTNERS
        GSI1SK: {stage}#{created_at}
        GSI2PK: CONTACT#{contact_id}  (if contact_id set)
        GSI2SK: PARTNER#{created_at}  (if contact_id set)
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "PARTNER#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    title: str = Field(..., max_length=255, description="Partner name or company")
    value: float = Field(default=0.0, description="Estimated referral value in dollars")
    commission_pct: float = Field(default=0.0, ge=0, le=100, description="Commission percentage for referrals")
    partner_type: PartnerType = Field(default=PartnerType.REFERRAL, description="Type of partner relationship")
    stage: str = Field(default="Prospect", description="Pipeline stage")
    contact_id: str | None = Field(None, description="Linked contact ID")
    contact_name: str | None = Field(None, description="Denormalized contact name for display")
    introduced_by: str | None = Field(None, description="ID of partner/contact who made the introduction")
    introduced_by_name: str | None = Field(None, description="Name of the person who introduced this partner")
    owner_id: str | None = Field(None, description="Partner owner user ID")
    owner_name: str | None = Field(None, description="Denormalized owner name")
    description: str | None = Field(None, description="Notes about this partner")
    priority: PartnerPriority = Field(default=PartnerPriority.MEDIUM, description="Partner priority")
    tags: list[str] = Field(default_factory=list, description="Partner tags")
    custom_fields: dict = Field(default_factory=dict, description="Custom field values")
    inactive_reason: str | None = Field(None, description="Reason partner became inactive")
    position: int = Field(default=0, description="Order position within stage column")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: PARTNER#{id}."""
        return f"PARTNER#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for stage-based queries."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#PARTNERS",
            "GSI1SK": f"{self.stage}#{self.created_at.isoformat()}",
        }

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """Get GSI2 keys for contact-based queries (if contact linked)."""
        if self.contact_id:
            return {
                "GSI2PK": f"CONTACT#{self.contact_id}",
                "GSI2SK": f"PARTNER#{self.created_at.isoformat()}",
            }
        return None


class CreatePartnerRequest(PydanticBaseModel):
    """Request model for creating a partner."""

    title: str = Field(..., min_length=1, max_length=255)
    value: float = Field(default=0.0, ge=0)
    commission_pct: float = Field(default=0.0, ge=0, le=100)
    partner_type: PartnerType = PartnerType.REFERRAL
    stage: str = Field(default="Prospect")
    contact_id: str | None = None
    contact_name: str | None = None
    introduced_by: str | None = None
    introduced_by_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str | None = None
    priority: PartnerPriority = PartnerPriority.MEDIUM
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    position: int = 0


class UpdatePartnerRequest(PydanticBaseModel):
    """Request model for updating a partner."""

    title: str | None = Field(None, min_length=1, max_length=255)
    value: float | None = Field(None, ge=0)
    commission_pct: float | None = Field(None, ge=0, le=100)
    partner_type: PartnerType | None = None
    stage: str | None = None
    contact_id: str | None = None
    contact_name: str | None = None
    introduced_by: str | None = None
    introduced_by_name: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str | None = None
    priority: PartnerPriority | None = None
    tags: list[str] | None = None
    custom_fields: dict | None = None
    inactive_reason: str | None = None
    position: int | None = None


class MovePartnerRequest(PydanticBaseModel):
    """Request model for moving a partner to a new stage."""

    stage: str = Field(..., min_length=1)
    position: int = Field(default=0, ge=0)
