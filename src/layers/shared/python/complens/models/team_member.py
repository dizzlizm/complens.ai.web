"""Team member model."""

from enum import Enum
from typing import ClassVar

from pydantic import Field

from complens.models.base import BaseModel


class TeamRole(str, Enum):
    """Team member roles."""

    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class MemberStatus(str, Enum):
    """Team member status."""

    ACTIVE = "active"
    INVITED = "invited"
    REMOVED = "removed"


class TeamMember(BaseModel):
    """Team member entity.

    PK: WS#{workspace_id}
    SK: MEMBER#{user_id}
    GSI1PK: USER#{user_id}
    GSI1SK: WS#{workspace_id}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "MEMBER#"

    user_id: str = Field(..., description="Cognito user ID")
    workspace_id: str = Field(..., description="Workspace ID")
    email: str = Field(..., description="Member email address")
    name: str = Field(default="", description="Display name")
    role: TeamRole = Field(default=TeamRole.MEMBER, description="Member role")
    status: MemberStatus = Field(default=MemberStatus.ACTIVE, description="Member status")
    invited_by: str | None = Field(default=None, description="User ID who invited this member")

    def get_pk(self) -> str:
        """Get partition key."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key."""
        return f"MEMBER#{self.user_id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for user -> workspace lookup."""
        return {
            "GSI1PK": f"USER#{self.user_id}",
            "GSI1SK": f"WS#{self.workspace_id}",
        }
