import { GitBranch, Users, MessageSquare, TrendingUp } from 'lucide-react';

const stats = [
  { name: 'Active Workflows', value: '12', icon: GitBranch, change: '+2 this week' },
  { name: 'Total Contacts', value: '2,451', icon: Users, change: '+127 this week' },
  { name: 'Messages Sent', value: '8,234', icon: MessageSquare, change: '+1.2k today' },
  { name: 'Conversion Rate', value: '24.3%', icon: TrendingUp, change: '+4.1%' },
];

export default function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">Welcome back! Here's what's happening with your marketing.</p>
      </div>

      {/* Stats grid */}
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

      {/* Recent activity and quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent workflows */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Workflows</h2>
          <div className="space-y-4">
            {[
              { name: 'Welcome Sequence', status: 'active', runs: 156 },
              { name: 'Abandoned Cart', status: 'active', runs: 89 },
              { name: 'Re-engagement', status: 'paused', runs: 23 },
            ].map((workflow) => (
              <div key={workflow.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <GitBranch className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">{workflow.name}</p>
                    <p className="text-sm text-gray-500">{workflow.runs} runs</p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  workflow.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {workflow.status}
                </span>
              </div>
            ))}
          </div>
          <button className="mt-4 text-sm text-primary-600 hover:text-primary-500 font-medium">
            View all workflows →
          </button>
        </div>

        {/* Quick actions */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <button className="w-full flex items-center gap-3 p-3 text-left bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Workflow</p>
                <p className="text-sm text-gray-500">Build a new automation</p>
              </div>
            </button>
            <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Import Contacts</p>
                <p className="text-sm text-gray-500">Add contacts from CSV</p>
              </div>
            </button>
            <button className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Send Campaign</p>
                <p className="text-sm text-gray-500">Send a one-time message</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
