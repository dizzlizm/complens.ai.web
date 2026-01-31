import { Link } from 'react-router-dom';
import { GitBranch, Users, MessageSquare, TrendingUp, Loader2, Plus } from 'lucide-react';
import { useWorkflows, useContacts, useCurrentWorkspace } from '../lib/hooks';

export default function Dashboard() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: workflows, isLoading: isLoadingWorkflows } = useWorkflows(workspaceId || '');
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(workspaceId || '');

  const isLoading = isLoadingWorkspace || isLoadingWorkflows || isLoadingContacts;

  // Calculate stats from real data
  const activeWorkflows = workflows?.filter(w => w.status === 'active').length || 0;
  const totalWorkflows = workflows?.length || 0;
  const totalContacts = contactsData?.contacts?.length || 0;
  const totalRuns = workflows?.reduce((sum, w) => sum + (w.runs_count || 0), 0) || 0;

  const stats = [
    {
      name: 'Active Workflows',
      value: isLoading ? '-' : activeWorkflows.toString(),
      icon: GitBranch,
      change: `${totalWorkflows} total`
    },
    {
      name: 'Total Contacts',
      value: isLoading ? '-' : totalContacts.toLocaleString(),
      icon: Users,
      change: 'In this workspace'
    },
    {
      name: 'Workflow Runs',
      value: isLoading ? '-' : totalRuns.toLocaleString(),
      icon: MessageSquare,
      change: 'All time'
    },
    {
      name: 'Conversion Rate',
      value: '-',
      icon: TrendingUp,
      change: 'Coming soon'
    },
  ];

  // Get recent workflows
  const recentWorkflows = workflows?.slice(0, 3) || [];

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">Welcome back! Here's what's happening with your marketing.</p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      )}

      {/* Stats grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.name} className="card">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <stat.icon className="h-6 w-6 text-primary-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                  <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-500">{stat.change}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent activity and quick actions */}
      {!isLoading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent workflows */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Workflows</h2>
            {recentWorkflows.length === 0 ? (
              <div className="text-center py-8">
                <GitBranch className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No workflows yet</p>
                <Link to="/workflows/new" className="btn btn-primary inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Workflow
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {recentWorkflows.map((workflow) => (
                    <Link
                      key={workflow.id}
                      to={`/workflows/${workflow.id}`}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <GitBranch className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900">{workflow.name}</p>
                          <p className="text-sm text-gray-500">{workflow.runs_count || 0} runs</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        workflow.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : workflow.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {workflow.status}
                      </span>
                    </Link>
                  ))}
                </div>
                <Link
                  to="/workflows"
                  className="mt-4 block text-sm text-primary-600 hover:text-primary-500 font-medium"
                >
                  View all workflows →
                </Link>
              </>
            )}
          </div>

          {/* Quick actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                to="/workflows/new"
                className="w-full flex items-center gap-3 p-3 text-left bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Create Workflow</p>
                  <p className="text-sm text-gray-500">Build a new automation</p>
                </div>
              </Link>
              <Link
                to="/contacts"
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Manage Contacts</p>
                  <p className="text-sm text-gray-500">View and add contacts</p>
                </div>
              </Link>
              <Link
                to="/workflows"
                className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">View Workflows</p>
                  <p className="text-sm text-gray-500">Manage your automations</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
