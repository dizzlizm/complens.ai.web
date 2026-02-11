"""Site model for domain-centric organization."""

from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field, field_validator

from complens.models.base import BaseModel


class Site(BaseModel):
    """Site entity - represents an internet domain as an organizational unit.

    Sites group pages, workflows, knowledge base documents, and AI profiles
    under a single domain (e.g., example.com). Contacts and Deals remain
    workspace-global.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: SITE#{id}
        GSI1PK: WS#{workspace_id}#SITES
        GSI1SK: {domain_name}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "SITE#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    domain_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Internet domain (e.g., example.com)",
    )
    name: str = Field(..., min_length=1, max_length=255, description="Display name")
    description: str | None = Field(None, max_length=1000, description="Site description")
    default_page_id: str | None = Field(None, description="Page served at root domain")
    settings: dict = Field(default_factory=dict, description="Site-specific settings")

    @field_validator("domain_name")
    @classmethod
    def normalize_domain(cls, v: str) -> str:
        """Normalize domain to lowercase, strip whitespace."""
        return v.lower().strip()

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: SITE#{id}."""
        return f"SITE#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing sites by workspace."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#SITES",
            "GSI1SK": self.domain_name,
        }

    def get_gsi3_keys(self) -> dict[str, str]:
        """Get GSI3 keys for global domain lookup."""
        return {
            "GSI3PK": f"SITE_DOMAIN#{self.domain_name}",
            "GSI3SK": f"SITE#{self.id}",
        }


class CreateSiteRequest(PydanticBaseModel):
    """Request model for creating a site."""

    domain_name: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    settings: dict = Field(default_factory=dict)


class UpdateSiteRequest(PydanticBaseModel):
    """Request model for updating a site."""

    domain_name: str | None = Field(None, min_length=1, max_length=255)
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    default_page_id: str | None = None
    settings: dict | None = None
