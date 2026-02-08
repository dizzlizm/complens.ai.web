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

    def find_by_token(self, token: str) -> Invitation | None:
        """Find an invitation by its token.

        This scans all invitations - acceptable since tokens are unique
        and the number of pending invitations is typically small.

        Args:
            token: The invitation token.

        Returns:
            Invitation if found, None otherwise.
        """
        from boto3.dynamodb.conditions import Attr

        # Don't use Limit with FilterExpression - DynamoDB applies limit before filtering
        # which would miss matching items. Scan without limit and paginate if needed.
        filter_expr = Attr("token").eq(token) & Attr("SK").begins_with("INVITE#")

        response = self.table.scan(FilterExpression=filter_expr)
        items = response.get("Items", [])

        # Paginate if necessary (unlikely for small invite tables)
        while not items and "LastEvaluatedKey" in response:
            response = self.table.scan(
                FilterExpression=filter_expr,
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items = response.get("Items", [])

        if items:
            return self.model_class.model_validate(items[0])
        return None
