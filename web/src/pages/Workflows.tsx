import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, GitBranch, MoreVertical, Play, Pause, Loader2, AlertTriangle, X, History } from 'lucide-react';
import { useWorkflows, useCurrentWorkspace, useDeleteWorkflow, type Workflow } from '../lib/hooks';
import api from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import DropdownMenu, { DropdownItem } from '../components/ui/DropdownMenu';
import WorkflowRuns from '../components/WorkflowRuns';

// Format trigger type for display
function formatTriggerType(triggerType: string): string {
  const mapping: Record<string, string> = {
    trigger_form_submitted: 'Form Submitted',
    trigger_tag_added: 'Tag Added',
    trigger_webhook: 'Webhook',
    trigger_schedule: 'Schedule',
    trigger_sms_received: 'SMS Received',
    trigger_email_received: 'Email Received',
    trigger_segment_event: 'Segment Event',
  };
  return mapping[triggerType] || triggerType;
}

// Format relative time
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

export default function Workflows() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingRunsWorkflow, setViewingRunsWorkflow] = useState<Workflow | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: workflows, isLoading, error, refetch } = useWorkflows(workspaceId || '');
  const deleteWorkflow = useDeleteWorkflow(workspaceId || '');
  const toast = useToast();

  // Toggle workflow status (active <-> paused)
  const handleToggleStatus = async (workflow: Workflow) => {
    if (!workspaceId || togglingId) return;

    const newStatus = workflow.status === 'active' ? 'paused' : 'active';
    setTogglingId(workflow.id);

    try {
      await api.put(`/workspaces/${workspaceId}/workflows/${workflow.id}`, {
        status: newStatus,
      });
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] });
      toast.success(`Workflow ${newStatus === 'active' ? 'activated' : 'paused'}`);
    } catch (error) {
      console.error('Failed to toggle workflow status:', error);
      toast.error('Failed to update workflow status');
    } finally {
      setTogglingId(null);
    }
  };

  // Delete workflow with confirmation
  const handleDelete = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow? This action cannot be undone.')) {
      return;
    }

    setDeletingId(workflowId);

    try {
      await deleteWorkflow.mutateAsync(workflowId);
      toast.success('Workflow deleted successfully');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error('Failed to delete workflow');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter workflows
  const filteredWorkflows = workflows?.filter((wf) => {
    const matchesSearch = wf.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wf.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || wf.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-gray-500">Workspace-level automation workflows</p>
        </div>
        <Link to="/workflows/new" className="btn btn-primary inline-flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Create Workflow
        </Link>
      </div>

      {/* Info banner about page-specific workflows */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Page-specific workflows are now managed in each page's editor.
          This page shows workspace-level workflows only.
        </p>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workflows..."
            className="input pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-full sm:w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Loading state */}
      {(isLoading || isLoadingWorkspace) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-medium text-red-800 mb-1">Failed to load workflows</h3>
          <p className="text-red-600 mb-4">Something went wrong while fetching your workflows.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredWorkflows.length === 0 && (
        <div className="card text-center py-12">
          <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No workflows yet</h3>
          <p className="text-gray-500 mb-4">Create your first workflow to start automating.</p>
          <Link to="/workflows/new" className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Workflow
          </Link>
        </div>
      )}

      {/* Workflows list */}
      {!isLoading && !error && filteredWorkflows.length > 0 && (
        <div className="card p-0 overflow-visible">
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
              {filteredWorkflows.map((workflow) => (
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
                    {formatTriggerType(workflow.trigger_type)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      workflow.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : workflow.status === 'paused'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {workflow.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => setViewingRunsWorkflow(workflow)}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {(workflow.runs_count || 0).toLocaleString()}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatRelativeTime(workflow.last_run_at)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleStatus(workflow)}
                        disabled={togglingId === workflow.id || workflow.status === 'draft'}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={workflow.status === 'active' ? 'Pause workflow' : workflow.status === 'draft' ? 'Publish to enable' : 'Activate workflow'}
                      >
                        {togglingId === workflow.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : workflow.status === 'active' ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                      </button>
                      <DropdownMenu
                        trigger={
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        }
                      >
                        <DropdownItem onClick={() => navigate(`/workflows/${workflow.id}`)}>
                          Edit
                        </DropdownItem>
                        <DropdownItem onClick={() => setViewingRunsWorkflow(workflow)}>
                          View Runs
                        </DropdownItem>
                        <DropdownItem
                          variant="danger"
                          onClick={() => handleDelete(workflow.id)}
                          disabled={deletingId === workflow.id}
                        >
                          {deletingId === workflow.id ? 'Deleting...' : 'Delete'}
                        </DropdownItem>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Workflow Runs Modal */}
      {viewingRunsWorkflow && workspaceId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <History className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {viewingRunsWorkflow.name}
                  </h2>
                  <p className="text-sm text-gray-500">Execution History</p>
                </div>
              </div>
              <button
                onClick={() => setViewingRunsWorkflow(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <WorkflowRuns
                workspaceId={workspaceId}
                workflowId={viewingRunsWorkflow.id}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
