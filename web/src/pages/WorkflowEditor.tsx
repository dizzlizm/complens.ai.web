import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, Settings, Loader2, Trash2 } from 'lucide-react';
import { type Node, type Edge } from '@xyflow/react';
import WorkflowCanvas, { type WorkflowCanvasRef } from '../components/workflow/WorkflowCanvas';
import NodeToolbar from '../components/workflow/NodeToolbar';
import {
  useWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
  useCurrentWorkspace,
  type WorkflowNode,
  type WorkflowEdge,
} from '../lib/hooks';

export default function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const canvasRef = useRef<WorkflowCanvasRef>(null);

  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: workflow, isLoading: isLoadingWorkflow } = useWorkflow(
    workspaceId || '',
    id || ''
  );

  const createWorkflow = useCreateWorkflow(workspaceId || '');
  const updateWorkflow = useUpdateWorkflow(workspaceId || '', id || '');

  const [name, setName] = useState('Untitled Workflow');
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load workflow data when available
  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      // Convert API nodes/edges to React Flow format
      if (workflow.nodes && canvasRef.current) {
        const rfNodes: Node[] = workflow.nodes.map((n: WorkflowNode) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        }));
        const rfEdges: Edge[] = (workflow.edges || []).map((e: WorkflowEdge) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          animated: true,
        }));
        canvasRef.current.setNodes(rfNodes);
        canvasRef.current.setEdges(rfEdges);
      }
    }
  }, [workflow]);

  // Track changes
  const handleCanvasChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Save workflow
  const handleSave = async () => {
    if (!workspaceId || !canvasRef.current) return;

    setIsSaving(true);
    try {
      const nodes = canvasRef.current.getNodes();
      const edges = canvasRef.current.getEdges();

      // Convert React Flow format to API format
      const apiNodes: WorkflowNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type || 'action',
        position: n.position,
        data: n.data as WorkflowNode['data'],
      }));

      const apiEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      }));

      // Find trigger node for trigger_type
      const triggerNode = nodes.find((n) => n.type === 'trigger');
      const triggerType = (triggerNode?.data?.nodeType as string) || 'trigger_manual';
      const triggerConfig = (triggerNode?.data?.config as Record<string, unknown>) || {};

      if (isNew) {
        const created = await createWorkflow.mutateAsync({
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          nodes: apiNodes,
          edges: apiEdges,
        });
        setHasChanges(false);
        // Navigate to the created workflow
        navigate(`/workflows/${created.id}`, { replace: true });
      } else {
        await updateWorkflow.mutateAsync({
          name,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          nodes: apiNodes,
          edges: apiEdges,
        });
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isLoadingWorkspace || (!isNew && isLoadingWorkflow);

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHasChanges(true);
              }}
              className="text-lg font-semibold text-gray-900 bg-transparent border-0 focus:ring-0 p-0"
              placeholder="Workflow name"
            />
            <p className="text-sm text-gray-500">
              {isNew ? 'New workflow' : hasChanges ? 'Unsaved changes' : 'All changes saved'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-400 mr-2 hidden sm:block">
            Select nodes and press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">Delete</kbd> to remove
          </div>
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Test</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <NodeToolbar />
        <div className="flex-1 bg-gray-100">
          <WorkflowCanvas
            ref={canvasRef}
            workflowId={id}
            onChange={handleCanvasChange}
          />
        </div>
      </div>

      {/* Delete hint overlay */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg text-sm text-gray-600 flex items-center gap-2">
        <Trash2 className="w-4 h-4" />
        <span>Select + <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Delete</kbd> to remove nodes</span>
      </div>
    </div>
  );
}
