"""Team member and invitation repositories."""

from complens.models.invitation import Invitation
from complens.models.team_member import MemberStatus, TeamMember, TeamRole
from complens.repositories.base import BaseRepository


class TeamRepository(BaseRepository[TeamMember]):
    """Repository for TeamMember entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize team repository."""
        super().__init__(TeamMember, table_name)

    def list_members(self, workspace_id: str, limit: int = 100) -> list[TeamMember]:
        """List all team members for a workspace."""
        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="MEMBER#",
            limit=limit,
        )
        return items

    def get_member(self, workspace_id: str, user_id: str) -> TeamMember | None:
        """Get a specific team member."""
        return self.get(pk=f"WS#{workspace_id}", sk=f"MEMBER#{user_id}")

    def get_workspaces_for_user(self, user_id: str) -> list[TeamMember]:
        """Get all workspace memberships for a user."""
        items, _ = self.query(
            pk=f"USER#{user_id}",
            sk_begins_with="WS#",
            index_name="GSI1",
        )
        return items

    def add_member(self, member: TeamMember) -> TeamMember:
        """Add a new team member."""
        return self.create(member, gsi_keys=member.get_gsi1_keys())

    def update_member(self, member: TeamMember) -> TeamMember:
        """Update a team member."""
        return self.update(member, gsi_keys=member.get_gsi1_keys())

    def remove_member(self, workspace_id: str, user_id: str) -> bool:
        """Remove a team member."""
        return self.delete(pk=f"WS#{workspace_id}", sk=f"MEMBER#{user_id}")


class InvitationRepository(BaseRepository[Invitation]):
    """Repository for Invitation entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize invitation repository."""
        super().__init__(Invitation, table_name)

    def list_pending(self, workspace_id: str) -> list[Invitation]:
        """List pending invitations for a workspace."""
        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="INVITE#",
        )
        return [inv for inv in items if not inv.is_expired]

    def get_invitation(self, workspace_id: str, email: str) -> Invitation | None:
        """Get a specific invitation."""
        return self.get(pk=f"WS#{workspace_id}", sk=f"INVITE#{email}")

    def get_invitations_for_email(self, email: str) -> list[Invitation]:
        """Get all invitations for an email address."""
        items, _ = self.query(
            pk=f"INVITE_EMAIL#{email}",
            sk_begins_with="WS#",
            index_name="GSI1",
        )
        return items

    def create_invitation(self, invitation: Invitation) -> Invitation:
        """Create a new invitation."""
        return self.put(invitation, gsi_keys=invitation.get_gsi1_keys())

    def revoke_invitation(self, workspace_id: str, email: str) -> bool:
        """Revoke an invitation."""
        return self.delete(pk=f"WS#{workspace_id}", sk=f"INVITE#{email}")
