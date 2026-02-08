import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminUsers, useDisableUser, useEnableUser } from '@/lib/hooks/useAdmin';
import { Users, Search, ChevronRight, Shield, UserX, UserCheck } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function AdminUsers() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = useAdminUsers({ limit: 50, cursor });
  const disableUser = useDisableUser();
  const enableUser = useEnableUser();
  const { showToast } = useToast();

  const handleToggleUser = async (userId: string, currentlyEnabled: boolean) => {
    try {
      if (currentlyEnabled) {
        await disableUser.mutateAsync(userId);
        showToast('success', 'User disabled');
      } else {
        await enableUser.mutateAsync(userId);
        showToast('success', 'User enabled');
      }
    } catch {
      showToast('error', 'Failed to update user');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-green-600/20 text-green-400';
      case 'UNCONFIRMED':
        return 'bg-yellow-600/20 text-yellow-400';
      case 'FORCE_CHANGE_PASSWORD':
        return 'bg-orange-600/20 text-orange-400';
      default:
        return 'bg-gray-600/20 text-gray-400';
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-gray-400 mt-1">Manage platform users</p>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Users</p>
            <p className="text-2xl font-bold text-white mt-1">{data.count}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search users..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* Users table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400">
            Failed to load users
          </div>
        ) : data?.users.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No users found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {data?.users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                          {user.is_super_admin ? (
                            <Shield className="w-5 h-5 text-red-400" />
                          ) : (
                            <Users className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white">{user.email}</p>
                          {user.name && (
                            <p className="text-xs text-gray-500">{user.name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(user.status)}`}>
                          {user.status}
                        </span>
                        {!user.enabled && (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-red-600/20 text-red-400">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {user.is_super_admin ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-600/20 text-red-400 border border-red-600/30">
                          <Shield className="w-3 h-3" />
                          Super Admin
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">User</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleUser(user.id, user.enabled)}
                          disabled={disableUser.isPending || enableUser.isPending}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                            user.enabled
                              ? 'text-red-400 hover:bg-red-600/20'
                              : 'text-green-400 hover:bg-green-600/20'
                          }`}
                          title={user.enabled ? 'Disable user' : 'Enable user'}
                        >
                          {user.enabled ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                        <Link
                          to={`/admin/users/${user.id}`}
                          className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
                        >
                          View <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data?.next_cursor && (
              <div className="px-4 py-3 border-t border-gray-700 flex justify-center">
                <button
                  onClick={() => setCursor(data.next_cursor ?? undefined)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
