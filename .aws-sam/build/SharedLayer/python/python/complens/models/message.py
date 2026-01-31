"""Message model for conversation messages."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class MessageDirection(str, Enum):
    """Message direction enum."""

    INBOUND = "inbound"
    OUTBOUND = "outbound"


class MessageChannel(str, Enum):
    """Message channel enum."""

    SMS = "sms"
    EMAIL = "email"
    WEBCHAT = "webchat"
    WHATSAPP = "whatsapp"


class MessageStatus(str, Enum):
    """Message delivery status enum."""

    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class MessageSender(str, Enum):
    """Message sender type enum."""

    CONTACT = "contact"
    USER = "user"
    AI = "ai"
    SYSTEM = "system"


class Message(BaseModel):
    """Message entity - represents a single message in a conversation.

    Key Pattern:
        PK: CONV#{conversation_id}
        SK: MSG#{created_at}#{id}
    """

    _pk_prefix: ClassVar[str] = "CONV#"
    _sk_prefix: ClassVar[str] = "MSG#"

    conversation_id: str = Field(..., description="Parent conversation ID")
    workspace_id: str = Field(..., description="Workspace ID for denormalization")
    contact_id: str = Field(..., description="Contact ID for denormalization")

    # Message content
    content: str = Field(..., min_length=1, description="Message content")
    content_type: str = Field(default="text", description="Content type (text, html, etc.)")

    # Message metadata
    direction: MessageDirection = Field(..., description="Message direction")
    channel: MessageChannel = Field(..., description="Communication channel")
    sender_type: MessageSender = Field(..., description="Who sent the message")
    sender_id: str | None = Field(None, description="Sender user ID (if user/AI)")

    # Delivery status
    status: MessageStatus = Field(default=MessageStatus.PENDING, description="Delivery status")
    external_id: str | None = Field(None, description="External provider message ID")
    error_message: str | None = Field(None, description="Error message if failed")

    # Email-specific fields
    email_subject: str | None = Field(None, max_length=500, description="Email subject line")
    email_from: str | None = Field(None, description="Email from address")
    email_to: list[str] = Field(default_factory=list, description="Email recipients")
    email_cc: list[str] = Field(default_factory=list, description="Email CC recipients")

    # Attachments
    attachments: list[dict] = Field(default_factory=list, description="Message attachments")

    # AI metadata
    ai_generated: bool = Field(default=False, description="Whether AI generated this message")
    ai_confidence: float | None = Field(None, ge=0, le=1, description="AI confidence score")
    ai_model: str | None = Field(None, description="AI model used")

    def get_pk(self) -> str:
        """Get partition key: CONV#{conversation_id}."""
        return f"CONV#{self.conversation_id}"

    def get_sk(self) -> str:
        """Get sort key: MSG#{created_at}#{id} for chronological ordering."""
        return f"MSG#{self.created_at.isoformat()}#{self.id}"


class CreateMessageRequest(PydanticBaseModel):
    """Request model for creating a message."""

    content: str = Field(..., min_length=1)
    content_type: str = Field(default="text")
    direction: MessageDirection = Field(default=MessageDirection.OUTBOUND)
    channel: MessageChannel
    sender_type: MessageSender = Field(default=MessageSender.USER)

    # Email fields
    email_subject: str | None = None
    email_to: list[str] = Field(default_factory=list)
    email_cc: list[str] = Field(default_factory=list)

    # Attachments
    attachments: list[dict] = Field(default_factory=list)
