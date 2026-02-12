import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useAdminWorkspace,
  useUpdateAdminWorkspace,
  useWorkspaceStats,
  useDeleteWorkspace,
  useWorkspaceMembers,
  useAddWorkspaceMember,
  useUpdateWorkspaceMember,
  useRemoveWorkspaceMember,
  useAdminUsers,
  type AdminUser,
} from '@/lib/hooks/useAdmin';
import {
  ArrowLeft,
  Building2,
  User,
  Save,
  MessageSquare,
  Phone,
  Mail,
  FileText,
  Users,
  Workflow,
  FormInput,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Trash2,
  UserPlus,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useToast } from '@/components/Toast';

export default function AdminWorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useAdminWorkspace(id);
  const { data: stats, isLoading: statsLoading } = useWorkspaceStats(id);
  const { data: membersData, isLoading: membersLoading } = useWorkspaceMembers(id);
  const updateWorkspace = useUpdateAdminWorkspace(id || '');
  const deleteWorkspace = useDeleteWorkspace();
  const addMember = useAddWorkspaceMember(id || '');
  const updateMember = useUpdateWorkspaceMember(id || '');
  const removeMember = useRemoveWorkspaceMember(id || '');
  const { showToast } = useToast();

  const [editPlan, setEditPlan] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');

  const { data: allUsers } = useAdminUsers({ limit: 60 });
  const filteredUsers = useMemo(() => {
    if (!allUsers?.users || !addMemberSearch) return [];
    const q = addMemberSearch.toLowerCase();
    return allUsers.users.filter(
      (u: AdminUser) =>
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [allUsers, addMemberSearch]);

  const handleSavePlan = async () => {
    if (!editPlan) return;
    try {
      await updateWorkspace.mutateAsync({ plan: editPlan });
      showToast('success', 'Workspace plan updated');
      setEditPlan(null);
    } catch {
      showToast('error', 'Failed to update plan');
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!id) return;
    try {
      await deleteWorkspace.mutateAsync(id);
      showToast('success', 'Workspace deleted');
      navigate('/admin/workspaces');
    } catch {
      showToast('error', 'Failed to delete workspace');
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    try {
      await addMember.mutateAsync({ user_id: selectedUserId, role: selectedRole });
      showToast('success', 'Member added');
      setShowAddMemberModal(false);
      setAddMemberSearch('');
      setSelectedUserId('');
      setSelectedRole('member');
    } catch {
      showToast('error', 'Failed to add member');
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await updateMember.mutateAsync({ userId, role });
      showToast('success', 'Role updated');
    } catch {
      showToast('error', 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      await removeMember.mutateAsync(userId);
      showToast('success', 'Member removed');
    } catch {
      showToast('error', 'Failed to remove member');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load workspace</p>
        <Link to="/admin/workspaces" className="text-red-400 hover:text-red-300 mt-4 inline-block">
          Back to workspaces
        </Link>
      </div>
    );
  }

  const { workspace, owner } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin/workspaces"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workspaces
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7 text-gray-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
              <p className="text-gray-500 font-mono text-sm">{workspace.id}</p>
            </div>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 rounded-lg flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete Workspace
          </button>
        </div>
      </div>

      {/* Integration Status & Subscription Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Integration Status */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Twilio SMS</span>
          </div>
          <div className="flex items-center gap-2">
            {workspace.has_twilio ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-medium">Configured</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-500" />
                <span className="text-gray-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">SendGrid Email</span>
          </div>
          <div className="flex items-center gap-2">
            {workspace.has_sendgrid ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-medium">Configured</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-500" />
                <span className="text-gray-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Trial Ends</span>
          </div>
          <p className="text-white font-medium">
            {workspace.trial_ends_at
              ? new Date(workspace.trial_ends_at).toLocaleDateString()
              : '-'}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Billing Period End</span>
          </div>
          <p className="text-white font-medium">
            {workspace.plan_period_end
              ? new Date(workspace.plan_period_end).toLocaleDateString()
              : '-'}
          </p>
        </div>
      </div>

      {/* Content Stats */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Contacts</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.contacts ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Pages</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.pages ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Workflow className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-400">Workflows</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.workflows ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FormInput className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-gray-400">Forms</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.forms ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-gray-400">KB Docs</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.documents ?? 0}
          </p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <span className="text-xs text-gray-500 uppercase">Sites</span>
          <p className="text-lg font-bold text-white">{statsLoading ? '...' : stats?.sites ?? 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <span className="text-xs text-gray-500 uppercase">Team Members</span>
          <p className="text-lg font-bold text-white">{statsLoading ? '...' : stats?.team_members ?? 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <span className="text-xs text-gray-500 uppercase">Deals</span>
          <p className="text-lg font-bold text-white">{statsLoading ? '...' : stats?.deals ?? 0}</p>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <span className="text-xs text-gray-500 uppercase">Conversations</span>
          <p className="text-lg font-bold text-white">{statsLoading ? '...' : stats?.conversations ?? 0}</p>
        </div>
      </div>

      {/* Workflow Runs Stats */}
      {stats?.workflow_runs && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Workflow Runs
          </h3>
          <div className="flex gap-6">
            <div>
              <span className="text-gray-400 text-sm">Total</span>
              <p className="text-xl font-bold text-white">{stats.workflow_runs.total}</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Succeeded</span>
              <p className="text-xl font-bold text-green-400">{stats.workflow_runs.succeeded}</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Failed</span>
              <p className="text-xl font-bold text-red-400">{stats.workflow_runs.failed}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Workspace Details */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            Workspace Details
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">Name</label>
              <p className="text-white">{workspace.name}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Status</label>
              <p className={workspace.is_active ? 'text-green-400' : 'text-red-400'}>
                {workspace.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Plan</label>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={editPlan ?? workspace.plan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
                {editPlan && editPlan !== workspace.plan && (
                  <button
                    onClick={handleSavePlan}
                    disabled={updateWorkspace.isPending}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400">Subscription Status</label>
              <p className="text-white">{workspace.subscription_status || 'None'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Stripe Customer</label>
              <p className="text-white font-mono text-sm">
                {workspace.stripe_customer_id || '-'}
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Notification Email</label>
              <p className="text-white">{workspace.notification_email || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Twilio Phone</label>
              <p className="text-white">{workspace.twilio_phone || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Created</label>
              <p className="text-white">
                {workspace.created_at
                  ? new Date(workspace.created_at).toLocaleString()
                  : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Owner Details */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            Owner
          </h2>

          {owner ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Email</label>
                <p className="text-white">{owner.email}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Name</label>
                <p className="text-white">{owner.name || '-'}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Status</label>
                <p className="text-white">{owner.status}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Enabled</label>
                <p className={owner.enabled ? 'text-green-400' : 'text-red-400'}>
                  {owner.enabled ? 'Yes' : 'No'}
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-400">User ID</label>
                <p className="text-gray-500 font-mono text-sm">{owner.id}</p>
              </div>

              <Link
                to={`/admin/users/${owner.id}`}
                className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 mt-4"
              >
                View User Details
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">Owner not found</p>
            </div>
          )}
        </div>
      </div>

      {/* Team Members */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            Team Members
          </h2>
          <button
            onClick={() => setShowAddMemberModal(true)}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add Member
          </button>
        </div>

        {membersLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500"></div>
          </div>
        ) : (
          <>
            {/* Members Table */}
            {membersData?.members && membersData.members.length > 0 ? (
              <table className="w-full mb-4">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Joined</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {membersData.members.map((member) => (
                    <tr key={member.user_id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-white font-medium">{member.email}</p>
                          {member.name && <p className="text-xs text-gray-500">{member.name}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-red-500"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {member.created_at
                          ? new Date(member.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveMember(member.user_id)}
                          className="p-1 text-red-400 hover:bg-red-600/20 rounded transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 text-sm mb-4">No team members</p>
            )}

            {/* Pending Invitations */}
            {membersData?.invitations && membersData.invitations.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Pending Invitations</h3>
                <div className="space-y-2">
                  {membersData.invitations.map((inv) => (
                    <div key={inv.email} className="flex items-center justify-between px-4 py-2 bg-gray-700/30 rounded">
                      <div>
                        <p className="text-white text-sm">{inv.email}</p>
                        <p className="text-xs text-gray-500">
                          Role: {inv.role} &middot; Expires: {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '-'}
                        </p>
                      </div>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-600/20 text-yellow-400">
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Workspace Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Delete Workspace</h3>
            </div>

            <p className="text-gray-400 mb-4">
              This will permanently delete the workspace <strong className="text-white">{workspace.name}</strong> and
              all associated data including pages, contacts, workflows, forms, and conversations. This action cannot be undone.
            </p>

            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">
                Type <strong className="text-white">{workspace.name}</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                placeholder={workspace.name}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteWorkspace}
                disabled={deleteConfirmName !== workspace.name || deleteWorkspace.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {deleteWorkspace.isPending ? 'Deleting...' : 'Delete Workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Member</h3>
              <button
                onClick={() => { setShowAddMemberModal(false); setAddMemberSearch(''); setSelectedUserId(''); }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">Search User</label>
              <input
                type="text"
                value={addMemberSearch}
                onChange={(e) => { setAddMemberSearch(e.target.value); setSelectedUserId(''); }}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                placeholder="Search by email or name..."
              />
              {filteredUsers.length > 0 && !selectedUserId && (
                <div className="mt-1 bg-gray-700 border border-gray-600 rounded-lg max-h-40 overflow-y-auto">
                  {filteredUsers.map((u: AdminUser) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelectedUserId(u.id); setAddMemberSearch(u.email); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm"
                    >
                      <p className="text-white">{u.email}</p>
                      {u.name && <p className="text-xs text-gray-400">{u.name}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowAddMemberModal(false); setAddMemberSearch(''); setSelectedUserId(''); }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={!selectedUserId || addMember.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {addMember.isPending ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
