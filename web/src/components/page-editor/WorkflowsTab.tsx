import { Link } from 'react-router-dom';
import { usePageWorkflows, useDeletePageWorkflow } from '../../lib/hooks/useWorkflows';
import { useToast } from '../Toast';
import { Plus, Trash2, GitBranch, ExternalLink } from 'lucide-react';

export interface WorkflowsTabProps {
  workspaceId: string;
  pageId: string;
}

export default function WorkflowsTab({ workspaceId, pageId }: WorkflowsTabProps) {
  const { data: pageWorkflows } = usePageWorkflows(workspaceId, pageId);
  const deleteWorkflow = useDeletePageWorkflow(workspaceId || '', pageId || '');
  const toast = useToast();

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await deleteWorkflow.mutateAsync(workflowId);
      toast.success('Workflow deleted');
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      toast.error('Failed to delete workflow');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          Page-specific workflows that trigger from this page's forms or events.
        </p>
        <Link
          to={`/workflows/new?pageId=${pageId}`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Workflow
        </Link>
      </div>

      {pageWorkflows && pageWorkflows.length > 0 ? (
        <div className="space-y-3">
          {pageWorkflows.map((workflow) => (
            <div
              key={workflow.id}
              className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300"
            >
              <div className="p-2 bg-purple-100 rounded-lg">
                <GitBranch className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{workflow.name}</p>
                <p className="text-sm text-gray-500">
                  Status: {workflow.status} • {workflow.nodes?.length || 0} nodes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/workflows/${workflow.id}`}
                  className="p-2 text-gray-400 hover:text-indigo-600"
                  title="Edit workflow"
                >
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => handleDeleteWorkflow(workflow.id)}
                  className="p-2 text-gray-400 hover:text-red-500"
                  title="Delete workflow"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500 mb-2">No workflows for this page yet</p>
          <Link
            to={`/workflows/new?pageId=${pageId}`}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Create your first workflow
          </Link>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Workspace-level workflows (not attached to a page) can be managed from the{' '}
          <Link to="/workflows" className="underline hover:text-blue-900">
            Workflows page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
