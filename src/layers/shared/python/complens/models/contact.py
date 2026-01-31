"""Contact model for marketing contacts."""

from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, EmailStr, Field

from complens.models.base import BaseModel


class Contact(BaseModel):
    """Contact entity - represents a marketing contact.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: CONTACT#{id}
        GSI1PK: WS#{workspace_id}#EMAIL
        GSI1SK: {email}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "CONTACT#"

    workspace_id: str = Field(..., description="Parent workspace ID")

    # Core contact fields
    email: str | None = Field(None, description="Email address")
    phone: str | None = Field(None, description="Phone number (E.164 format)")
    first_name: str | None = Field(None, max_length=100, description="First name")
    last_name: str | None = Field(None, max_length=100, description="Last name")

    # Status and segmentation
    tags: list[str] = Field(default_factory=list, description="Contact tags for segmentation")
    status: str = Field(default="active", description="Contact status")
    source: str | None = Field(None, description="Lead source")

    # Custom fields
    custom_fields: dict = Field(default_factory=dict, description="Custom field values")

    # Engagement metrics
    total_messages_sent: int = Field(default=0, description="Total messages sent to contact")
    total_messages_received: int = Field(default=0, description="Total messages from contact")
    last_contacted_at: str | None = Field(None, description="Last contact timestamp")
    last_response_at: str | None = Field(None, description="Last response timestamp")

    # Opt-in status
    sms_opt_in: bool = Field(default=False, description="SMS opt-in status")
    email_opt_in: bool = Field(default=True, description="Email opt-in status")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: CONTACT#{id}."""
        return f"CONTACT#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str] | None:
        """Get GSI1 keys for email lookup (if email exists)."""
        if self.email:
            return {
                "GSI1PK": f"WS#{self.workspace_id}#EMAIL",
                "GSI1SK": self.email.lower(),
            }
        return None

    @property
    def full_name(self) -> str:
        """Get full name of contact."""
        parts = [p for p in [self.first_name, self.last_name] if p]
        return " ".join(parts) if parts else "Unknown"

    def add_tag(self, tag: str) -> None:
        """Add a tag to the contact."""
        tag = tag.strip().lower()
        if tag and tag not in self.tags:
            self.tags.append(tag)

    def remove_tag(self, tag: str) -> None:
        """Remove a tag from the contact."""
        tag = tag.strip().lower()
        if tag in self.tags:
            self.tags.remove(tag)

    def has_tag(self, tag: str) -> bool:
        """Check if contact has a specific tag."""
        return tag.strip().lower() in self.tags


class CreateContactRequest(PydanticBaseModel):
    """Request model for creating a contact."""

    email: EmailStr | None = None
    phone: str | None = Field(None, pattern=r"^\+[1-9]\d{1,14}$")
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    tags: list[str] = Field(default_factory=list)
    source: str | None = None
    custom_fields: dict = Field(default_factory=dict)
    sms_opt_in: bool = False
    email_opt_in: bool = True


class UpdateContactRequest(PydanticBaseModel):
    """Request model for updating a contact."""

    email: EmailStr | None = None
    phone: str | None = Field(None, pattern=r"^\+[1-9]\d{1,14}$")
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    tags: list[str] | None = None
    status: str | None = None
    source: str | None = None
    custom_fields: dict | None = None
    sms_opt_in: bool | None = None
    email_opt_in: bool | None = None
