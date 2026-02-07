import { useParams, Link } from 'react-router-dom';
import { useAdminUser, useDisableUser, useEnableUser, useUserStats } from '@/lib/hooks/useAdmin';
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
} from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdminUser(id);
  const { data: userStats, isLoading: statsLoading } = useUserStats(id);
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const { showToast } = useToast();

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
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            Workspaces ({workspaces.length})
          </h2>

          {workspaces.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No workspaces</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspaces.map((workspace) => (
                <Link
                  key={workspace.id}
                  to={`/admin/workspaces/${workspace.id}`}
                  className="block p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{workspace.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{workspace.id}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      workspace.plan === 'pro'
                        ? 'bg-blue-600/20 text-blue-400'
                        : workspace.plan === 'business'
                        ? 'bg-purple-600/20 text-purple-400'
                        : 'bg-gray-600/20 text-gray-400'
                    }`}>
                      {workspace.plan}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
