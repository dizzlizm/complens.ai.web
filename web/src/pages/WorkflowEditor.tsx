import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, Loader2 } from 'lucide-react';
import { type Node, type Edge } from '@xyflow/react';
import WorkflowCanvas, { type WorkflowCanvasRef } from '../components/workflow/WorkflowCanvas';
import NodeToolbar from '../components/workflow/NodeToolbar';
import NodeConfigPanel from '../components/workflow/NodeConfigPanel';
import {
  useWorkflow,
  useUpdateWorkflow,
  useExecuteWorkflow,
  useCurrentWorkspace,
  useCreateWorkspace,
  type WorkflowNode,
  type WorkflowEdge,
  type Workflow,
  type CreateWorkflowInput,
} from '../lib/hooks';
import api from '../lib/api';
import { useToast } from '../components/Toast';

export default function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const canvasRef = useRef<WorkflowCanvasRef>(null);
  const toast = useToast();

  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: workflow, isLoading: isLoadingWorkflow } = useWorkflow(
    workspaceId || '',
    id || ''
  );

  const updateWorkflow = useUpdateWorkflow(workspaceId || '', id || '');
  const executeWorkflow = useExecuteWorkflow(workspaceId || '', id || '');

  const [name, setName] = useState('Untitled Workflow');
  const [hasChanges, setHasChanges] = useState(isNew); // New workflows start with changes (the default trigger node)
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const createWorkspace = useCreateWorkspace();

  // Load workflow data when available
  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      // Convert API nodes/edges to React Flow format
      if (workflow.nodes && canvasRef.current) {
        const rfNodes: Node[] = workflow.nodes.map((n: WorkflowNode) => {
          // Derive React Flow type (category) from specific node type
          // e.g., "trigger_form_submitted" -> "trigger", "action_send_email" -> "action"
          const nodeType = n.type || n.data?.nodeType || 'action';
          let rfType = 'action';
          if (nodeType.startsWith('trigger_')) rfType = 'trigger';
          else if (nodeType.startsWith('action_')) rfType = 'action';
          else if (nodeType.startsWith('logic_')) rfType = 'logic';
          else if (nodeType.startsWith('ai_')) rfType = 'ai';

          return {
            id: n.id,
            type: rfType, // React Flow category for rendering
            position: n.position,
            data: {
              ...n.data,
              nodeType: nodeType, // Keep specific type in data
            },
          };
        });
        const rfEdges: Edge[] = (workflow.edges || []).map((e: WorkflowEdge) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.source_handle,
          targetHandle: e.target_handle,
          animated: true,
        }));
        canvasRef.current.setNodes(rfNodes);
        canvasRef.current.setEdges(rfEdges);
      }
    }
  }, [workflow]);

  // Get selected node from canvas (avoids state duplication)
  const selectedNode = selectedNodeId && canvasRef.current
    ? canvasRef.current.getNodes().find(n => n.id === selectedNodeId) || null
    : null;

  // Track changes
  const handleCanvasChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Handle node selection - just track the ID, not the full node
  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNodeId(node?.id || null);
  }, []);

  // Handle node data update from config panel
  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    if (canvasRef.current) {
      canvasRef.current.updateNodeData(nodeId, data);
      setHasChanges(true);
    }
  }, []);

  // Save workflow
  const handleSave = async () => {
    if (!canvasRef.current) return;

    // Check for workspace - create one if missing
    let effectiveWorkspaceId = workspaceId;
    if (!effectiveWorkspaceId) {
      toast.info('Creating a default workspace...');
      try {
        // Generate a slug from name
        const slug = 'my-workspace-' + Date.now().toString(36);
        const newWorkspace = await createWorkspace.mutateAsync({
          name: 'My Workspace',
          slug,
        });
        effectiveWorkspaceId = newWorkspace.id;
      } catch (error) {
        toast.error(`Failed to create workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const nodes = canvasRef.current.getNodes();
      const edges = canvasRef.current.getEdges();

      // Validate: must have at least one trigger
      const triggerNode = nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) {
        toast.error('Workflow must have at least one trigger node.');
        setIsSaving(false);
        return;
      }

      // Convert React Flow format to API format
      // Note: Backend expects 'type' to be the specific node type (e.g., 'trigger_form_submitted')
      // not the React Flow category (e.g., 'trigger')
      const apiNodes: WorkflowNode[] = nodes.map((n) => ({
        id: n.id,
        type: (n.data as { nodeType?: string })?.nodeType || n.type || 'action',
        position: n.position,
        data: n.data as WorkflowNode['data'],
      }));

      const apiEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        source_handle: e.sourceHandle || undefined,
        target_handle: e.targetHandle || undefined,
      }));

      // Get viewport from React Flow
      const viewport = canvasRef.current.getViewport?.() || { x: 0, y: 0, zoom: 1 };

      if (isNew) {
        // Create workflow - backend derives trigger info from the trigger node itself
        const input: CreateWorkflowInput = {
          name,
          nodes: apiNodes,
          edges: apiEdges,
          viewport,
        };
        console.log('Creating workflow with payload:', JSON.stringify(input, null, 2));
        const { data: created } = await api.post<Workflow>(
          `/workspaces/${effectiveWorkspaceId}/workflows`,
          input
        );
        setHasChanges(false);
        toast.success('Workflow created successfully!');
        // Navigate to the created workflow
        navigate(`/workflows/${created.id}`, { replace: true });
      } else {
        await updateWorkflow.mutateAsync({
          name,
          nodes: apiNodes,
          edges: apiEdges,
          viewport,
        });
        setHasChanges(false);
        toast.success('Workflow saved!');
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Test workflow execution
  const handleTest = async () => {
    if (isNew || !workspaceId) {
      toast.warning('Please save the workflow before testing.');
      return;
    }

    // If there are unsaved changes, save first
    if (hasChanges) {
      await handleSave();
    }

    setIsTesting(true);
    try {
      const result = await executeWorkflow.mutateAsync(undefined);
      toast.success(`Workflow executed! Run ID: ${result.run_id || 'N/A'}`);
    } catch (error) {
      toast.error(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
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
          <button
            onClick={handleTest}
            disabled={isTesting || isNew}
            className="btn btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{isTesting ? 'Running...' : 'Test'}</span>
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
            onNodeSelect={handleNodeSelect}
          />
        </div>
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            workspaceId={workspaceId}
            onClose={() => setSelectedNodeId(null)}
            onUpdate={handleNodeUpdate}
          />
        )}
      </div>

      {/* Keyboard hint - only show when no config panel */}
      {!selectedNode && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg text-sm text-gray-600">
          Click a node to configure • <kbd className="px-1 py-0.5 bg-gray-100 rounded text-xs">Delete</kbd> to remove
        </div>
      )}
    </div>
  );
}
