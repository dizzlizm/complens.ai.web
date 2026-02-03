import { useState } from 'react';
import { useWorkflowRuns, type WorkflowRun } from '../lib/hooks/useWorkflows';
import { formatDistanceToNow } from 'date-fns';

interface WorkflowRunsProps {
  workspaceId: string;
  workflowId: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Pending' },
  running: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Running' },
  waiting: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Waiting' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function RunDetails({ run }: { run: WorkflowRun }) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
      {/* Timeline */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">Started</dt>
          <dd className="text-gray-900">
            {run.started_at ? new Date(run.started_at).toLocaleString() : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Completed</dt>
          <dd className="text-gray-900">
            {run.completed_at ? new Date(run.completed_at).toLocaleString() : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Steps Completed</dt>
          <dd className="text-gray-900">{run.steps_completed}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Trigger</dt>
          <dd className="text-gray-900">{run.trigger_type.replace('trigger_', '').replace(/_/g, ' ')}</dd>
        </div>
      </div>

      {/* Error info if failed */}
      {run.status === 'failed' && run.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-red-800 mb-1">Error</h4>
          <p className="text-sm text-red-700">{run.error_message}</p>
          {run.error_node_id && (
            <p className="text-xs text-red-600 mt-1">
              Failed at node: <code className="font-mono">{run.error_node_id}</code>
            </p>
          )}
        </div>
      )}

      {/* Trigger data */}
      {run.trigger_data && Object.keys(run.trigger_data).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Trigger Data</h4>
          <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">
            {JSON.stringify(run.trigger_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Variables/Output */}
      {run.variables && Object.keys(run.variables).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Variables</h4>
          <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">
            {JSON.stringify(run.variables, null, 2)}
          </pre>
        </div>
      )}

      {/* Contact link */}
      {run.contact_id && (
        <div className="text-sm">
          <span className="text-gray-500">Contact: </span>
          <a href={`/contacts/${run.contact_id}`} className="text-indigo-600 hover:underline">
            {run.contact_id}
          </a>
        </div>
      )}
    </div>
  );
}

export default function WorkflowRuns({ workspaceId, workflowId }: WorkflowRunsProps) {
  const { data: runs, isLoading, error } = useWorkflowRuns(workspaceId, workflowId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load runs. Please try again.
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No runs yet</h3>
        <p className="mt-1 text-sm text-gray-500">Runs will appear here when the workflow is triggered.</p>
      </div>
    );
  }

  // Filter runs
  const filteredRuns = filter === 'all'
    ? runs
    : runs.filter(run => run.status === filter);

  // Stats
  const stats = {
    total: runs.length,
    completed: runs.filter(r => r.status === 'completed').length,
    failed: runs.filter(r => r.status === 'failed').length,
    running: runs.filter(r => r.status === 'running' || r.status === 'pending').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Runs</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
          <p className="text-sm text-gray-500">Failed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-2xl font-bold text-blue-600">{stats.running}</p>
          <p className="text-sm text-gray-500">In Progress</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="all">All Runs</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Runs list */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
        {filteredRuns.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No runs match the selected filter.
          </div>
        ) : (
          filteredRuns.map((run) => (
            <div key={run.id} className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
              >
                <div className="flex items-center gap-4">
                  <StatusBadge status={run.status} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Run <code className="text-xs font-mono text-gray-600">{run.id.slice(0, 8)}</code>
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {run.steps_completed} step{run.steps_completed !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === run.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedId === run.id && <RunDetails run={run} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
