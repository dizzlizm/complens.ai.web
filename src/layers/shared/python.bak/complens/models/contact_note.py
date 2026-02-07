"""Contact note model for CRM notes."""

from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class ContactNote(BaseModel):
    """Contact note entity - represents a note on a contact.

    Key Pattern:
        PK: CONTACT#{contact_id}
        SK: NOTE#{created_at}#{id}
        GSI1PK: WS#{workspace_id}
        GSI1SK: NOTE#{created_at}
    """

    _pk_prefix: ClassVar[str] = "CONTACT#"
    _sk_prefix: ClassVar[str] = "NOTE#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    contact_id: str = Field(..., description="Parent contact ID")
    author_id: str = Field(..., description="User ID who created the note")
    author_name: str = Field(..., max_length=200, description="Display name of the author")
    content: str = Field(..., min_length=1, max_length=5000, description="Note content")
    pinned: bool = Field(default=False, description="Whether the note is pinned")

    def get_pk(self) -> str:
        """Get partition key: CONTACT#{contact_id}."""
        return f"CONTACT#{self.contact_id}"

    def get_sk(self) -> str:
        """Get sort key: NOTE#{created_at}#{id}."""
        return f"NOTE#{self.created_at.isoformat()}#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing notes by workspace."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}",
            "GSI1SK": f"NOTE#{self.created_at.isoformat()}",
        }


class CreateContactNoteRequest(PydanticBaseModel):
    """Request model for creating a contact note."""

    content: str = Field(..., min_length=1, max_length=5000)
    pinned: bool = False


class UpdateContactNoteRequest(PydanticBaseModel):
    """Request model for updating a contact note."""

    content: str | None = Field(None, min_length=1, max_length=5000)
    pinned: bool | None = None
