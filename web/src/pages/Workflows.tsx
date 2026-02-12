import { useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, GitBranch, MoreVertical, Play, Pause, Loader2, AlertTriangle, X, History, LayoutTemplate, Sparkles, Zap, DollarSign, Trophy, FileText } from 'lucide-react';
import { useWorkflows, useCurrentWorkspace, useDeleteWorkflow, useWorkflowEvents, type Workflow } from '../lib/hooks';
import { useWorkflowTemplates } from '../lib/hooks/useWorkflowTemplates';
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
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [runningWorkflows, setRunningWorkflows] = useState<Set<string>>(new Set());

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: workflows, isLoading, error, refetch } = useWorkflows(workspaceId || '', siteId);
  const { data: templates } = useWorkflowTemplates(workspaceId);
  const deleteWorkflow = useDeleteWorkflow(workspaceId || '');
  const toast = useToast();
  const basePath = siteId ? `/sites/${siteId}` : '';

  // Real-time workflow events
  const onWorkflowStarted = useCallback((event: { workflow_id: string }) => {
    setRunningWorkflows((prev) => new Set(prev).add(event.workflow_id));
  }, []);

  const onWorkflowCompleted = useCallback((event: { workflow_id: string }) => {
    setRunningWorkflows((prev) => {
      const next = new Set(prev);
      next.delete(event.workflow_id);
      return next;
    });
    toast.success('Workflow completed successfully');
  }, [toast]);

  const onWorkflowFailed = useCallback((event: { workflow_id: string }) => {
    setRunningWorkflows((prev) => {
      const next = new Set(prev);
      next.delete(event.workflow_id);
      return next;
    });
    toast.error('Workflow execution failed');
  }, [toast]);

  useWorkflowEvents({
    workspaceId: workspaceId || '',
    onWorkflowStarted,
    onWorkflowCompleted,
    onWorkflowFailed,
    autoInvalidate: true,
    enabled: !!workspaceId,
  });

  // Toggle workflow status (draft/paused -> active, active -> paused)
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
      const label = newStatus === 'active' ? 'activated' : 'paused';
      toast.success(`Workflow ${label}`);
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
        <button
          onClick={() => setShowTemplatePicker(true)}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Workflow
        </button>
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
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Workflow
          </button>
        </div>
      )}

      {/* Workflows list */}
      {!isLoading && !error && filteredWorkflows.length > 0 && (
        <div className="card p-0 overflow-x-auto">
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
                          to={`${basePath}/workflows/${workflow.id}`}
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
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        workflow.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : workflow.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {workflow.status}
                      </span>
                      {runningWorkflows.has(workflow.id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          Running
                        </span>
                      )}
                    </div>
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
                        disabled={togglingId === workflow.id}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={workflow.status === 'active' ? 'Pause workflow' : 'Activate workflow'}
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
                        <DropdownItem onClick={() => navigate(`${basePath}/workflows/${workflow.id}`)}>
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

      {/* Template Picker Modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Create Workflow</h2>
                  <p className="text-sm text-gray-500">Start from scratch or use a template</p>
                </div>
              </div>
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Start from scratch */}
                <button
                  onClick={() => {
                    setShowTemplatePicker(false);
                    navigate(`${basePath}/workflows/new`);
                  }}
                  className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-center"
                >
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Start from Scratch</p>
                    <p className="text-sm text-gray-500">Build a custom workflow</p>
                  </div>
                </button>

                {/* Template cards */}
                {(templates || []).map((template) => {
                  const iconMap: Record<string, React.ReactNode> = {
                    'dollar-sign': <DollarSign className="w-6 h-6" />,
                    'trophy': <Trophy className="w-6 h-6" />,
                    'zap': <Zap className="w-6 h-6" />,
                  };
                  return (
                    <button
                      key={template.id}
                      onClick={() => {
                        setShowTemplatePicker(false);
                        navigate(`${basePath}/workflows/new`, { state: { template } });
                      }}
                      className="flex flex-col items-center gap-3 p-6 border border-gray-200 rounded-lg hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-center"
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        template.builtin ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {template.icon && iconMap[template.icon]
                          ? iconMap[template.icon]
                          : template.builtin
                            ? <Sparkles className="w-6 h-6" />
                            : <FileText className="w-6 h-6" />
                        }
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{template.name}</p>
                        <p className="text-sm text-gray-500 line-clamp-2">{template.description}</p>
                        {template.category && (
                          <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                            {template.category}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
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
