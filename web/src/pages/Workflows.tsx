import { Link } from 'react-router-dom';
import { Plus, Search, GitBranch, MoreVertical, Play, Pause } from 'lucide-react';

const workflows = [
  {
    id: '1',
    name: 'Welcome Sequence',
    description: 'Onboard new subscribers with a 5-email welcome series',
    status: 'active',
    trigger: 'Form Submitted',
    runs: 1256,
    lastRun: '2 minutes ago',
  },
  {
    id: '2',
    name: 'Abandoned Cart Recovery',
    description: 'Re-engage users who left items in their cart',
    status: 'active',
    trigger: 'Tag Added',
    runs: 892,
    lastRun: '15 minutes ago',
  },
  {
    id: '3',
    name: 'Re-engagement Campaign',
    description: 'Win back inactive subscribers',
    status: 'paused',
    trigger: 'Segment Event',
    runs: 234,
    lastRun: '2 days ago',
  },
  {
    id: '4',
    name: 'Birthday Wishes',
    description: 'Send personalized birthday messages',
    status: 'active',
    trigger: 'Schedule',
    runs: 567,
    lastRun: '1 hour ago',
  },
];

export default function Workflows() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-gray-500">Create and manage your automation workflows</p>
        </div>
        <Link to="/workflows/new" className="btn btn-primary inline-flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Create Workflow
        </Link>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workflows..."
            className="input pl-10"
          />
        </div>
        <select className="input w-full sm:w-40">
          <option>All Status</option>
          <option>Active</option>
          <option>Paused</option>
          <option>Draft</option>
        </select>
      </div>

      {/* Workflows list */}
      <div className="card p-0 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Workflow
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trigger
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Runs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Run
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {workflows.map((workflow) => (
              <tr key={workflow.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                      <GitBranch className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                      <Link
                        to={`/workflows/${workflow.id}`}
                        className="font-medium text-gray-900 hover:text-primary-600"
                      >
                        {workflow.name}
                      </Link>
                      <p className="text-sm text-gray-500">{workflow.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {workflow.trigger}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    workflow.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {workflow.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {workflow.runs.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {workflow.lastRun}
                </td>
                <td className="px-6 py-4 text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="p-1 text-gray-400 hover:text-gray-600"
                      title={workflow.status === 'active' ? 'Pause' : 'Start'}
                    >
                      {workflow.status === 'active' ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>
                    <button className="p-1 text-gray-400 hover:text-gray-600">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
