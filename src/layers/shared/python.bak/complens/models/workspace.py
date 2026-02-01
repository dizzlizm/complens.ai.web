"""Workspace model for multi-tenant organization."""

from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class Workspace(BaseModel):
    """Workspace entity - represents a tenant workspace.

    Key Pattern:
        PK: AGENCY#{agency_id}
        SK: WS#{id}
        GSI1PK: WS#{id}
        GSI1SK: META
    """

    _pk_prefix: ClassVar[str] = "AGENCY#"
    _sk_prefix: ClassVar[str] = "WS#"

    agency_id: str = Field(..., description="Parent agency ID")
    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    slug: str = Field(..., min_length=1, max_length=100, description="URL-safe workspace slug")
    settings: dict = Field(default_factory=dict, description="Workspace-level settings")
    metadata: dict = Field(default_factory=dict, description="Custom metadata")
    is_active: bool = Field(default=True, description="Whether workspace is active")

    # Integration settings
    twilio_phone_number: str | None = Field(None, description="Twilio phone number for SMS")
    twilio_account_sid: str | None = Field(None, description="Twilio account SID")
    sendgrid_api_key_id: str | None = Field(None, description="SendGrid API key secret ID")

    def get_pk(self) -> str:
        """Get partition key: AGENCY#{agency_id}."""
        return f"AGENCY#{self.agency_id}"

    def get_sk(self) -> str:
        """Get sort key: WS#{id}."""
        return f"WS#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for workspace lookup by ID."""
        return {"GSI1PK": f"WS#{self.id}", "GSI1SK": "META"}

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """Get GSI2 keys for workspace lookup by phone number.

        Returns:
            GSI2 keys if phone number is configured, None otherwise.
        """
        if self.twilio_phone_number:
            # Normalize phone for lookup
            normalized = self._normalize_phone(self.twilio_phone_number)
            return {"GSI2PK": f"PHONE#{normalized}", "GSI2SK": f"WS#{self.id}"}
        return None

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Normalize phone number for consistent lookups.

        Args:
            phone: Phone number in various formats.

        Returns:
            Normalized phone number (digits only with country code).
        """
        if phone.startswith("+"):
            return "".join(filter(str.isdigit, phone))
        cleaned = "".join(filter(str.isdigit, phone))
        # Assume US if 10 digits
        if len(cleaned) == 10:
            return "1" + cleaned
        return cleaned


class CreateWorkspaceRequest(PydanticBaseModel):
    """Request model for creating a workspace."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    settings: dict = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)


class UpdateWorkspaceRequest(PydanticBaseModel):
    """Request model for updating a workspace."""

    name: str | None = Field(None, min_length=1, max_length=255)
    settings: dict | None = None
    metadata: dict | None = None
    is_active: bool | None = None
    twilio_phone_number: str | None = None
    twilio_account_sid: str | None = None
    sendgrid_api_key_id: str | None = None
