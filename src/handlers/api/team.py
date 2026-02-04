"""Team Management API handler."""

import json
import os
from typing import Any
from urllib.parse import unquote

import boto3
import structlog
from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.invitation import Invitation
from complens.models.team_member import MemberStatus, TeamMember, TeamRole
from complens.repositories.team import InvitationRepository, TeamRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


class InviteRequest(PydanticBaseModel):
    """Request to invite a team member."""

    email: str = Field(..., min_length=3, max_length=255)
    role: str = Field(default="member")


class UpdateRoleRequest(PydanticBaseModel):
    """Request to update a member's role."""

    role: str = Field(..., description="New role: admin or member")


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle team API requests.

    Routes:
        GET    /workspaces/{workspace_id}/team
        POST   /workspaces/{workspace_id}/team/invite
        PUT    /workspaces/{workspace_id}/team/{user_id}
        DELETE /workspaces/{workspace_id}/team/{user_id}
        DELETE /workspaces/{workspace_id}/team/invitations/{email}
        POST   /team/accept-invite
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        user_id = path_params.get("user_id")

        auth = get_auth_context(event)

        team_repo = TeamRepository()
        invite_repo = InvitationRepository()

        # Accept-invite is not workspace-scoped (user doesn't have access yet)
        if "/accept-invite" in path and http_method == "POST":
            return accept_invitation(team_repo, invite_repo, auth, event)

        # All other routes require workspace access
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        # Route to handler
        if "/invite" in path and http_method == "POST":
            return invite_member(team_repo, invite_repo, workspace_id, auth, event)
        elif "/invitations/" in path and http_method == "DELETE":
            # Use pathParameters (URL-decoded by API Gateway) instead of path splitting
            email = path_params.get("email") or unquote(path.split("/invitations/")[-1])
            return revoke_invitation(invite_repo, workspace_id, email)
        elif http_method == "GET" and not user_id:
            return list_team(team_repo, invite_repo, workspace_id)
        elif http_method == "PUT" and user_id:
            return update_role(team_repo, workspace_id, user_id, event)
        elif http_method == "DELETE" and user_id:
            return remove_member(team_repo, workspace_id, user_id, auth)
        else:
            return error("Method not allowed", 405)

    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Team handler error", error=str(e))
        return error("Internal server error", 500)


def list_team(
    team_repo: TeamRepository,
    invite_repo: InvitationRepository,
    workspace_id: str,
) -> dict:
    """List team members and pending invitations."""
    members = team_repo.list_members(workspace_id)
    invitations = invite_repo.list_pending(workspace_id)

    return success({
        "members": [m.model_dump(mode="json") for m in members],
        "invitations": [i.model_dump(mode="json") for i in invitations],
    })


def invite_member(
    team_repo: TeamRepository,
    invite_repo: InvitationRepository,
    workspace_id: str,
    auth,
    event: dict,
) -> dict:
    """Invite a new team member."""
    try:
        body = json.loads(event.get("body", "{}"))
        request = InviteRequest.model_validate(body)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    except Exception as e:
        return validation_error([{"field": "body", "message": str(e)}])

    # Validate role
    if request.role not in ("admin", "member"):
        return error("Role must be 'admin' or 'member'", 400)

    # Check if already a member
    existing_members = team_repo.list_members(workspace_id)
    for member in existing_members:
        if member.email == request.email:
            return error("User is already a team member", 400)

    # Check if already invited
    existing_invite = invite_repo.get_invitation(workspace_id, request.email)
    if existing_invite and not existing_invite.is_expired:
        return error("User has already been invited", 400)

    # Create invitation
    invitation = Invitation(
        workspace_id=workspace_id,
        email=request.email,
        role=request.role,
        invited_by=auth.user_id,
        invited_by_email=auth.email or "",
    )

    invite_repo.create_invitation(invitation)

    # Build accept URL based on environment
    stage = os.environ.get("STAGE", "dev")
    if stage == "prod":
        base_url = "https://complens.ai"
    else:
        base_url = f"https://{stage}.complens.ai"
    accept_url = f"{base_url}/accept-invite?token={invitation.token}"

    # Send invitation email via SES
    email_sent = False
    email_error_msg = None
    try:
        from complens.services.email_service import get_email_service

        inviter = auth.email or "A team member"
        email_service = get_email_service()
        email_service.send_email(
            to=request.email,
            subject=f"{inviter} invited you to join their workspace on Complens.ai",
            body_html=f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
                <h2 style="color: #111827; margin-bottom: 16px;">You've been invited!</h2>
                <p style="color: #4b5563; line-height: 1.6;">{inviter} has invited you to join their workspace on Complens.ai as a <strong>{request.role}</strong>.</p>
                <p style="margin: 24px 0;">
                    <a href="{accept_url}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invitation</a>
                </p>
                <p style="color: #9ca3af; font-size: 14px;">This invitation expires in 7 days.</p>
            </div>
            """,
            body_text=f"{inviter} invited you to join their workspace on Complens.ai as a {request.role}. Accept at: {accept_url}",
        )
        email_sent = True
    except Exception as e:
        email_error_msg = str(e)
        logger.error("Failed to send invitation email", error=email_error_msg, email=request.email)

    logger.info(
        "Team member invited",
        workspace_id=workspace_id,
        email=request.email,
        role=request.role,
        email_sent=email_sent,
    )

    result = invitation.model_dump(mode="json")
    result["email_sent"] = email_sent
    if not email_sent:
        result["email_error"] = email_error_msg

    return created(result)


def update_role(
    team_repo: TeamRepository,
    workspace_id: str,
    user_id: str,
    event: dict,
) -> dict:
    """Update a team member's role."""
    member = team_repo.get_member(workspace_id, user_id)
    if not member:
        return not_found("TeamMember", user_id)

    if member.role == TeamRole.OWNER:
        return error("Cannot change the owner's role", 400)

    try:
        body = json.loads(event.get("body", "{}"))
        request = UpdateRoleRequest.model_validate(body)
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)
    except Exception as e:
        return validation_error([{"field": "body", "message": str(e)}])

    if request.role not in ("admin", "member"):
        return error("Role must be 'admin' or 'member'", 400)

    member.role = TeamRole(request.role)
    team_repo.update_member(member)

    logger.info("Team member role updated", workspace_id=workspace_id, user_id=user_id, role=request.role)

    return success(member.model_dump(mode="json"))


def remove_member(
    team_repo: TeamRepository,
    workspace_id: str,
    user_id: str,
    auth,
) -> dict:
    """Remove a team member."""
    member = team_repo.get_member(workspace_id, user_id)
    if not member:
        return not_found("TeamMember", user_id)

    if member.role == TeamRole.OWNER:
        return error("Cannot remove the workspace owner", 400)

    if member.user_id == auth.user_id:
        return error("Cannot remove yourself", 400)

    team_repo.remove_member(workspace_id, user_id)

    logger.info("Team member removed", workspace_id=workspace_id, user_id=user_id)

    return success({"removed": True, "user_id": user_id})


def revoke_invitation(
    invite_repo: InvitationRepository,
    workspace_id: str,
    email: str,
) -> dict:
    """Revoke a pending invitation."""
    invitation = invite_repo.get_invitation(workspace_id, email)
    if not invitation:
        return not_found("Invitation", email)

    invite_repo.revoke_invitation(workspace_id, email)

    logger.info("Invitation revoked", workspace_id=workspace_id, email=email)

    return success({"revoked": True, "email": email})


def accept_invitation(
    team_repo: TeamRepository,
    invite_repo: InvitationRepository,
    auth,
    event: dict,
) -> dict:
    """Accept an invitation using a token.

    The user must be authenticated. We look up invitations by their email
    and match the provided token.
    """
    try:
        body = json.loads(event.get("body", "{}"))
        token = body.get("token")
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    if not token:
        return error("Token is required", 400)

    if not auth.email:
        return error("Could not determine your email address", 400)

    # Find all pending invitations for this email
    invitations = invite_repo.get_invitations_for_email(auth.email)

    # Find the invitation matching the token
    matching_invite = None
    for inv in invitations:
        if inv.token == token:
            matching_invite = inv
            break

    if not matching_invite:
        return error("Invalid or expired invitation token", 404)

    if matching_invite.is_expired:
        return error("This invitation has expired", 400)

    workspace_id = matching_invite.workspace_id

    # Check if already a member
    existing = team_repo.get_member(workspace_id, auth.user_id)
    if existing:
        # Already a member, just clean up the invitation
        invite_repo.revoke_invitation(workspace_id, auth.email)
        return success({
            "accepted": True,
            "workspace_id": workspace_id,
            "already_member": True,
        })

    # Create team member
    member = TeamMember(
        user_id=auth.user_id,
        workspace_id=workspace_id,
        email=auth.email,
        name=auth.email.split("@")[0],
        role=TeamRole(matching_invite.role),
        status=MemberStatus.ACTIVE,
        invited_by=matching_invite.invited_by,
    )
    team_repo.add_member(member)

    # Remove the invitation
    invite_repo.revoke_invitation(workspace_id, auth.email)

    # Update Cognito custom:workspace_ids so the JWT includes the new workspace
    _update_cognito_workspace_ids(auth.user_id, workspace_id)

    logger.info(
        "Invitation accepted",
        workspace_id=workspace_id,
        user_id=auth.user_id,
        role=matching_invite.role,
    )

    return success({
        "accepted": True,
        "workspace_id": workspace_id,
        "role": matching_invite.role,
    })


def _update_cognito_workspace_ids(user_id: str, new_workspace_id: str) -> None:
    """Add a workspace ID to the user's Cognito custom:workspace_ids attribute.

    Args:
        user_id: Cognito user sub.
        new_workspace_id: Workspace ID to add.
    """
    user_pool_id = os.environ.get("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        logger.warning("COGNITO_USER_POOL_ID not set, skipping workspace_ids update")
        return

    try:
        cognito = boto3.client("cognito-idp")

        # Get current attributes
        user_resp = cognito.admin_get_user(
            UserPoolId=user_pool_id,
            Username=user_id,
        )

        current_ws_ids = ""
        for attr in user_resp.get("UserAttributes", []):
            if attr["Name"] == "custom:workspace_ids":
                current_ws_ids = attr["Value"]
                break

        # Append the new workspace ID
        existing_ids = [ws.strip() for ws in current_ws_ids.split(",") if ws.strip()]
        if new_workspace_id not in existing_ids:
            existing_ids.append(new_workspace_id)

        # Update the attribute
        cognito.admin_update_user_attributes(
            UserPoolId=user_pool_id,
            Username=user_id,
            UserAttributes=[
                {
                    "Name": "custom:workspace_ids",
                    "Value": ",".join(existing_ids),
                }
            ],
        )

        logger.info(
            "Updated Cognito workspace_ids",
            user_id=user_id,
            workspace_ids=",".join(existing_ids),
        )
    except Exception as e:
        logger.warning(
            "Failed to update Cognito workspace_ids",
            error=str(e),
            user_id=user_id,
        )
