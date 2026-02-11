"""Deferred email model for SQS message payloads."""

from datetime import datetime

from pydantic import BaseModel, Field

from complens.models.base import utc_now


class DeferredEmail(BaseModel):
    """Deferred email payload for SQS queue.

    Not stored in DynamoDB - used as a structured SQS message body
    when an email exceeds the warm-up daily limit.
    """

    to: list[str] = Field(..., description="Recipient email addresses")
    subject: str = Field(..., description="Email subject")
    body_text: str | None = Field(None, description="Plain text body")
    body_html: str | None = Field(None, description="HTML body")
    from_email: str = Field(..., description="Sender email address")
    reply_to: list[str] | None = Field(None, description="Reply-to addresses")
    cc: list[str] | None = Field(None, description="CC addresses")
    bcc: list[str] | None = Field(None, description="BCC addresses")
    tags: dict[str, str] | None = Field(None, description="Message tags")
    domain: str = Field(..., description="Sending domain")
    deferred_at: datetime = Field(default_factory=utc_now, description="When the email was deferred")
