import { useState } from 'react';
import { Loader2, UserPlus, MoreVertical, Mail, Clock, Shield } from 'lucide-react';
import {
  useTeamMembers,
  useUpdateRole,
  useRemoveMember,
  useRevokeInvitation,
} from '../../lib/hooks/useTeam';
import InviteModal from './InviteModal';

interface TeamManagementProps {
  workspaceId: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TeamManagement({ workspaceId }: TeamManagementProps) {
  const { data: teamData, isLoading } = useTeamMembers(workspaceId || undefined);
  const updateRole = useUpdateRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const revokeInvitation = useRevokeInvitation(workspaceId);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      setActiveDropdown(null);
    } catch {
      // handled by mutation state
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    try {
      await removeMember.mutateAsync(userId);
    } catch {
      // handled by mutation state
    }
  };

  const handleRevokeInvitation = async (email: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      await revokeInvitation.mutateAsync(email);
    } catch {
      // handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  const members = teamData?.members || [];
  const invitations = teamData?.invitations || [];

  return (
    <div className="space-y-6">
      {/* Members */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <button
            onClick={() => setShowInviteModal(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        </div>

        {members.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No team members yet. You're the only one here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Joined
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member.user_id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-primary-700">
                            {(member.name || member.email).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{member.name || member.email.split('@')[0]}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        member.role === 'owner'
                          ? 'bg-purple-100 text-purple-800'
                          : member.role === 'admin'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(member.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {member.role !== 'owner' && (
                        <div className="relative inline-block">
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === member.user_id ? null : member.user_id)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          {activeDropdown === member.user_id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10 py-1">
                              <button
                                onClick={() => handleRoleChange(member.user_id, member.role === 'admin' ? 'member' : 'admin')}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                              >
                                {member.role === 'admin' ? 'Change to Member' : 'Make Admin'}
                              </button>
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Invitations</h2>
          <div className="space-y-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.email}
                className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">{invitation.email}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{invitation.role}</span>
                      <span className="text-gray-300">|</span>
                      <Clock className="w-3 h-3" />
                      <span>Expires {formatDate(invitation.expires_at)}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeInvitation(invitation.email)}
                  disabled={revokeInvitation.isPending}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          workspaceId={workspaceId}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
