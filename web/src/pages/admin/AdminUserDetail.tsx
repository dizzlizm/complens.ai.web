import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useAdminUser,
  useDisableUser,
  useEnableUser,
  useDeleteUser,
  useToggleSuperAdmin,
  useAdminWorkspaces,
  useUserStats,
} from '@/lib/hooks/useAdmin';
import {
  ArrowLeft,
  User,
  Building2,
  Shield,
  UserX,
  UserCheck,
  Users,
  FileText,
  Workflow,
  FormInput,
  BarChart3,
  Trash2,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useToast } from '@/components/Toast';

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useAdminUser(id);
  const { data: userStats, isLoading: statsLoading } = useUserStats(id);
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const deleteUser = useDeleteUser();
  const toggleSuperAdmin = useToggleSuperAdmin();
  const { showToast } = useToast();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAddWsModal, setShowAddWsModal] = useState(false);
  const [wsSearch, setWsSearch] = useState('');
  const [selectedWsId, setSelectedWsId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');

  const { data: allWorkspaces } = useAdminWorkspaces({ limit: 100 });
  const filteredWorkspaces = useMemo(() => {
    if (!allWorkspaces?.workspaces || !wsSearch) return [];
    const q = wsSearch.toLowerCase();
    return allWorkspaces.workspaces
      .filter((ws) => ws.name.toLowerCase().includes(q) || ws.id.toLowerCase().includes(q))
      .slice(0, 10);
  }, [allWorkspaces, wsSearch]);

  const handleToggleUser = async () => {
    if (!data?.user) return;
    try {
      if (data.user.enabled) {
        await disableUser.mutateAsync(data.user.id);
        showToast('success', 'User disabled');
      } else {
        await enableUser.mutateAsync(data.user.id);
        showToast('success', 'User enabled');
      }
    } catch {
      showToast('error', 'Failed to update user');
    }
  };

  const handleDeleteUser = async () => {
    if (!id) return;
    try {
      await deleteUser.mutateAsync(id);
      showToast('success', 'User deleted');
      navigate('/admin/users');
    } catch {
      showToast('error', 'Failed to delete user');
    }
  };

  const handleToggleSuperAdmin = async () => {
    if (!id) return;
    const currentStatus = data?.user?.is_super_admin;
    const action = currentStatus ? 'revoke super admin from' : 'grant super admin to';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      await toggleSuperAdmin.mutateAsync(id);
      showToast('success', currentStatus ? 'Super admin revoked' : 'Super admin granted');
    } catch {
      showToast('error', 'Failed to toggle super admin');
    }
  };

  const handleRemoveFromWorkspace = async (workspaceId: string) => {
    if (!id) return;
    if (!confirm('Remove user from this workspace?')) return;
    try {
      // We need a workspace-specific mutation, create an inline one
      const { default: api } = await import('@/lib/api');
      await api.delete(`/admin/workspaces/${workspaceId}/members/${id}`);
      showToast('success', 'Removed from workspace');
      // Refetch user data
      window.location.reload();
    } catch {
      showToast('error', 'Failed to remove from workspace');
    }
  };

  const handleAddToWorkspace = async () => {
    if (!selectedWsId || !id) return;
    try {
      const { default: api } = await import('@/lib/api');
      await api.post(`/admin/workspaces/${selectedWsId}/members`, {
        user_id: id,
        role: selectedRole,
      });
      showToast('success', 'Added to workspace');
      setShowAddWsModal(false);
      setWsSearch('');
      setSelectedWsId('');
      setSelectedRole('member');
      window.location.reload();
    } catch {
      showToast('error', 'Failed to add to workspace');
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
        <p className="text-red-400">Failed to load user</p>
        <Link to="/admin/users" className="text-red-400 hover:text-red-300 mt-4 inline-block">
          Back to users
        </Link>
      </div>
    );
  }

  const { user, workspaces } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin/users"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Users
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              user.is_super_admin ? 'bg-red-600/20' : 'bg-gray-700'
            }`}>
              {user.is_super_admin ? (
                <Shield className="w-7 h-7 text-red-400" />
              ) : (
                <User className="w-7 h-7 text-gray-400" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{user.email}</h1>
              {user.name && (
                <p className="text-gray-400">{user.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleUser}
              disabled={disableUser.isPending || enableUser.isPending}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 ${
                user.enabled
                  ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-600/30'
              }`}
            >
              {user.enabled ? (
                <>
                  <UserX className="w-4 h-4" />
                  Disable User
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  Enable User
                </>
              )}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 rounded-lg flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete User
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          Aggregate Stats (All Workspaces)
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Workspaces</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {statsLoading ? '...' : userStats?.workspace_count ?? workspaces.length}
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-400">Contacts</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {statsLoading ? '...' : userStats?.total_contacts ?? 0}
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-400">Pages</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {statsLoading ? '...' : userStats?.total_pages ?? 0}
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Workflow className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-400">Workflows</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {statsLoading ? '...' : userStats?.total_workflows ?? 0}
            </p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FormInput className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-gray-400">Forms</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {statsLoading ? '...' : userStats?.total_forms ?? 0}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Details */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            User Details
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">Email</label>
              <p className="text-white">{user.email}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Name</label>
              <p className="text-white">{user.name || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Status</label>
              <p className="text-white">{user.status}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Enabled</label>
              <p className={user.enabled ? 'text-green-400' : 'text-red-400'}>
                {user.enabled ? 'Yes' : 'No'}
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Role</label>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-white">
                  {user.is_super_admin ? (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <Shield className="w-4 h-4" />
                      Super Admin
                    </span>
                  ) : (
                    'User'
                  )}
                </p>
                <button
                  onClick={handleToggleSuperAdmin}
                  disabled={toggleSuperAdmin.isPending}
                  className={`px-3 py-1 text-xs rounded-lg border disabled:opacity-50 ${
                    user.is_super_admin
                      ? 'border-gray-600 text-gray-400 hover:bg-gray-700'
                      : 'border-red-600/30 text-red-400 hover:bg-red-600/20'
                  }`}
                >
                  {toggleSuperAdmin.isPending
                    ? 'Updating...'
                    : user.is_super_admin
                    ? 'Revoke Super Admin'
                    : 'Grant Super Admin'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400">User ID</label>
              <p className="text-gray-500 font-mono text-sm">{user.id}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Agency ID</label>
              <p className="text-gray-500 font-mono text-sm">{user.agency_id || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Created</label>
              <p className="text-white">
                {user.created_at
                  ? new Date(user.created_at).toLocaleString()
                  : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* User's Workspaces */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-400" />
              Workspaces ({workspaces.length})
            </h2>
            <button
              onClick={() => setShowAddWsModal(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add to Workspace
            </button>
          </div>

          {workspaces.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No workspaces</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="p-4 bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      to={`/admin/workspaces/${workspace.id}`}
                      className="hover:text-red-400 transition-colors"
                    >
                      <p className="font-medium text-white">{workspace.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{workspace.id}</p>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        workspace.plan === 'pro'
                          ? 'bg-blue-600/20 text-blue-400'
                          : workspace.plan === 'business'
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'bg-gray-600/20 text-gray-400'
                      }`}>
                        {workspace.plan}
                      </span>
                      <button
                        onClick={() => handleRemoveFromWorkspace(workspace.id)}
                        className="p-1 text-red-400 hover:bg-red-600/20 rounded transition-colors"
                        title="Remove from workspace"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete User Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-600/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Delete User</h3>
            </div>

            <p className="text-gray-400 mb-3">
              This will permanently delete the user <strong className="text-white">{user.email}</strong> from Cognito.
            </p>

            {workspaces.length > 0 && (
              <div className="mb-3 p-3 bg-gray-700/50 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">The following workspaces will be affected:</p>
                <ul className="text-sm space-y-1">
                  {workspaces.map((ws) => (
                    <li key={ws.id} className="text-white flex items-center gap-2">
                      <Building2 className="w-3 h-3 text-gray-500" />
                      {ws.name}
                      <span className="text-xs text-red-400">
                        {ws.plan === 'free' ? '(will be deleted - owned)' : '(will be removed)'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">
                Type <strong className="text-white">DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                placeholder="DELETE"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteConfirmText !== 'DELETE' || deleteUser.isPending}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                {deleteUser.isPending ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Workspace Modal */}
      {showAddWsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add to Workspace</h3>
              <button
                onClick={() => { setShowAddWsModal(false); setWsSearch(''); setSelectedWsId(''); }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-sm text-gray-400 block mb-1">Search Workspace</label>
              <input
                type="text"
                value={wsSearch}
                onChange={(e) => { setWsSearch(e.target.value); setSelectedWsId(''); }}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                placeholder="Search by name or ID..."
              />
              {filteredWorkspaces.length > 0 && !selectedWsId && (
                <div className="mt-1 bg-gray-700 border border-gray-600 rounded-lg max-h-40 overflow-y-auto">
                  {filteredWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { setSelectedWsId(ws.id); setWsSearch(ws.name); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-600 text-sm"
                    >
                      <p className="text-white">{ws.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{ws.id}</p>
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
                onClick={() => { setShowAddWsModal(false); setWsSearch(''); setSelectedWsId(''); }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToWorkspace}
                disabled={!selectedWsId}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Add to Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
