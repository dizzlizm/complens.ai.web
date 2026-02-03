"""Invitation model."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import ClassVar

from pydantic import Field

from complens.models.base import BaseModel


def generate_invite_token() -> str:
    """Generate a secure invitation token."""
    return secrets.token_urlsafe(32)


def default_expires_at() -> datetime:
    """Default expiration: 7 days from now."""
    return datetime.now(timezone.utc) + timedelta(days=7)


class Invitation(BaseModel):
    """Invitation entity.

    PK: WS#{workspace_id}
    SK: INVITE#{email}
    GSI1PK: INVITE_EMAIL#{email}
    GSI1SK: WS#{workspace_id}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "INVITE#"

    workspace_id: str = Field(..., description="Workspace ID")
    email: str = Field(..., description="Invitee email address")
    role: str = Field(default="member", description="Role to assign on acceptance")
    invited_by: str = Field(..., description="User ID who sent the invite")
    invited_by_email: str = Field(default="", description="Email of inviter")
    token: str = Field(default_factory=generate_invite_token, description="Secure acceptance token")
    expires_at: datetime = Field(default_factory=default_expires_at, description="Token expiration")

    def get_pk(self) -> str:
        """Get partition key."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key."""
        return f"INVITE#{self.email}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for email -> workspace lookup."""
        return {
            "GSI1PK": f"INVITE_EMAIL#{self.email}",
            "GSI1SK": f"WS#{self.workspace_id}",
        }

    @property
    def is_expired(self) -> bool:
        """Check if the invitation has expired."""
        return datetime.now(timezone.utc) > self.expires_at
