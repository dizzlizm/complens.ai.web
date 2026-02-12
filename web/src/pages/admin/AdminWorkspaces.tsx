import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAdminWorkspaces, usePlatformStats } from '@/lib/hooks/useAdmin';
import { Building2, Search, ChevronRight, Filter } from 'lucide-react';

export default function AdminWorkspaces() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data, isLoading, error } = useAdminWorkspaces({ limit: 50, cursor });
  const { data: platformStats } = usePlatformStats();

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
      case 'trialing':
        return 'bg-cyan-600/20 text-cyan-400';
      default:
        return 'bg-gray-600/20 text-gray-400';
    }
  };

  const filteredWorkspaces = useMemo(() => {
    return (data?.workspaces ?? []).filter((ws) => {
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!ws.name.toLowerCase().includes(q) && !ws.id.toLowerCase().includes(q)) {
          return false;
        }
      }
      // Plan filter
      if (planFilter !== 'all' && ws.plan !== planFilter) return false;
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'none' && ws.subscription_status) return false;
        if (statusFilter !== 'none' && ws.subscription_status !== statusFilter) return false;
      }
      return true;
    });
  }, [data?.workspaces, searchQuery, planFilter, statusFilter]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Workspaces</h1>
        <p className="text-gray-400 mt-1">Manage all platform workspaces</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Workspaces</p>
          <p className="text-2xl font-bold text-white mt-1">
            {platformStats?.total_workspaces ?? data?.count ?? 0}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Contacts</p>
          <p className="text-2xl font-bold text-white mt-1">
            {platformStats?.total_contacts ?? '-'}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Pages</p>
          <p className="text-2xl font-bold text-white mt-1">
            {platformStats?.total_pages ?? '-'}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-gray-400 text-sm">Total Workflows</p>
          <p className="text-2xl font-bold text-white mt-1">
            {platformStats?.total_workflows ?? '-'}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search workspaces by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
            <option value="none">No Subscription</option>
          </select>
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
        ) : filteredWorkspaces.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">
              {searchQuery || planFilter !== 'all' || statusFilter !== 'all'
                ? 'No workspaces match your filters'
                : 'No workspaces found'}
            </p>
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
                    Owner
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
                    <td className="px-4 py-4">
                      <Link
                        to={`/admin/users/${workspace.agency_id}`}
                        className="text-sm text-gray-400 hover:text-red-400 font-mono"
                        title={workspace.agency_id}
                      >
                        {workspace.agency_id?.slice(0, 8)}...
                      </Link>
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

            {/* Result count + Pagination */}
            <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {filteredWorkspaces.length} of {data?.count ?? 0} workspaces
              </span>
              {data?.next_cursor && (
                <button
                  onClick={() => setCursor(data.next_cursor ?? undefined)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Load More
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
