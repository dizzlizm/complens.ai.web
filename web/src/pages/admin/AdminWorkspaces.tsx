import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminWorkspaces } from '@/lib/hooks/useAdmin';
import { Building2, Search, ChevronRight } from 'lucide-react';

export default function AdminWorkspaces() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading, error } = useAdminWorkspaces({ limit: 50, cursor });

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'pro':
        return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'business':
        return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
      default:
        return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
    }
  };

  const getStatusBadgeColor = (status: string | null) => {
    switch (status) {
      case 'active':
        return 'bg-green-600/20 text-green-400';
      case 'canceled':
        return 'bg-red-600/20 text-red-400';
      case 'past_due':
        return 'bg-yellow-600/20 text-yellow-400';
      default:
        return 'bg-gray-600/20 text-gray-400';
    }
  };

  const filteredWorkspaces = (data?.workspaces ?? []).filter((ws) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return ws.name.toLowerCase().includes(q) || ws.id.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Workspaces</h1>
        <p className="text-gray-400 mt-1">Manage all platform workspaces</p>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Workspaces</p>
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
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* Workspaces table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-400">
            Failed to load workspaces
          </div>
        ) : data?.workspaces.length === 0 || filteredWorkspaces.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No workspaces found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Workspace
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
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
                {filteredWorkspaces.map((workspace) => (
                  <tr key={workspace.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{workspace.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{workspace.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border ${getPlanBadgeColor(workspace.plan)}`}>
                        {workspace.plan}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(workspace.subscription_status)}`}>
                        {workspace.subscription_status || 'none'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-400">
                      {workspace.created_at
                        ? new Date(workspace.created_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        to={`/admin/workspaces/${workspace.id}`}
                        className="inline-flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
                      >
                        View <ChevronRight className="w-4 h-4" />
                      </Link>
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
