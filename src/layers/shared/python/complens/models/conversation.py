"""Conversation model for contact communication threads."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class ConversationStatus(str, Enum):
    """Conversation status enum."""

    OPEN = "open"
    CLOSED = "closed"
    ARCHIVED = "archived"


class ConversationChannel(str, Enum):
    """Communication channel enum."""

    SMS = "sms"
    EMAIL = "email"
    WEBCHAT = "webchat"
    WHATSAPP = "whatsapp"


class Conversation(BaseModel):
    """Conversation entity - represents a communication thread with a contact.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: CONV#{id}
        GSI1PK: CONTACT#{contact_id}
        GSI1SK: CONV#{created_at}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "CONV#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    contact_id: str = Field(..., description="Contact ID")

    # Conversation details
    channel: ConversationChannel = Field(..., description="Communication channel")
    status: ConversationStatus = Field(
        default=ConversationStatus.OPEN, description="Conversation status"
    )
    subject: str | None = Field(None, max_length=500, description="Conversation subject/topic")

    # Metadata
    last_message_at: str | None = Field(None, description="Timestamp of last message")
    last_message_preview: str | None = Field(
        None, max_length=200, description="Preview of last message"
    )
    message_count: int = Field(default=0, description="Total message count")
    unread_count: int = Field(default=0, description="Unread message count")

    # AI handling
    ai_enabled: bool = Field(default=True, description="Whether AI can respond")
    ai_handoff_requested: bool = Field(
        default=False, description="Whether human handoff was requested"
    )

    # Assignment
    assigned_user_id: str | None = Field(None, description="Assigned user ID")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: CONV#{id}."""
        return f"CONV#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for contact conversation lookup."""
        return {
            "GSI1PK": f"CONTACT#{self.contact_id}",
            "GSI1SK": f"CONV#{self.created_at.isoformat()}",
        }


class CreateConversationRequest(PydanticBaseModel):
    """Request model for creating a conversation."""

    contact_id: str = Field(..., description="Contact ID")
    channel: ConversationChannel = Field(..., description="Communication channel")
    subject: str | None = Field(None, max_length=500)
    ai_enabled: bool = True
