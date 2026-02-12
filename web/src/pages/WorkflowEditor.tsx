import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Save, Play, Loader2, Sparkles, X, LayoutTemplate, ChevronDown, ChevronRight } from 'lucide-react';
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
  useContacts,
  useCreateContact,
  type WorkflowNode,
  type WorkflowEdge,
  type Workflow,
  type CreateWorkflowInput,
} from '../lib/hooks';
import { useGenerateWorkflow, useGeneratePageWorkflow } from '../lib/hooks/useAI';
import { useCreateTemplate } from '../lib/hooks/useWorkflowTemplates';
import { useWorkflowEvents, type WorkflowEvent } from '../lib/hooks/useWorkflowEvents';
import api from '../lib/api';
import { useToast } from '../components/Toast';

export default function WorkflowEditor() {
  const { id, siteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isNew = id === 'new';
  const canvasRef = useRef<WorkflowCanvasRef>(null);
  const toast = useToast();
  const basePath = siteId ? `/sites/${siteId}` : '';
  const templateFromState = (location.state as { template?: Record<string, unknown> })?.template;

  // Get pageId from query params (for page-level workflows)
  const pageId = searchParams.get('pageId') || undefined;

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
  const isLoadingDataRef = useRef(false); // Suppress onChange during data load

  // AI help modal state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const generateWorkflow = useGenerateWorkflow(workspaceId || '');

  const generatePageWorkflow = useGeneratePageWorkflow(workspaceId || '');
  const createWorkspace = useCreateWorkspace();

  // Save as template state
  const createTemplate = useCreateTemplate(workspaceId || '');
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // Execution log state
  const [executionEvents, setExecutionEvents] = useState<WorkflowEvent[]>([]);
  // Track which nodes are currently executing (for potential future canvas highlighting)
  const [executingNodeIds, setExecutingNodeIds] = useState<Set<string>>(new Set());
  void executingNodeIds; // Used by event callbacks below
  const [showExecutionLog, setShowExecutionLog] = useState(false);

  // Real-time workflow events (Part 4)
  useWorkflowEvents({
    workspaceId: workspaceId || '',
    enabled: !!workspaceId && !isNew,
    autoInvalidate: true,
    onWorkflowStarted: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id) {
        setExecutionEvents([event]);
        setExecutingNodeIds(new Set());
        setShowExecutionLog(true);
      }
    }, [id]),
    onWorkflowCompleted: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id) {
        setExecutionEvents((prev) => [...prev, event]);
        setExecutingNodeIds(new Set());
        toast.success('Workflow execution completed!');
      }
    }, [id, toast]),
    onWorkflowFailed: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id) {
        setExecutionEvents((prev) => [...prev, event]);
        setExecutingNodeIds(new Set());
        toast.error(`Workflow failed: ${event.error || 'Unknown error'}`);
      }
    }, [id, toast]),
    onNodeExecuting: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id && event.node_id) {
        setExecutionEvents((prev) => [...prev, event]);
        setExecutingNodeIds((prev) => new Set(prev).add(event.node_id!));
      }
    }, [id]),
    onNodeCompleted: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id && event.node_id) {
        setExecutionEvents((prev) => [...prev, event]);
        setExecutingNodeIds((prev) => {
          const next = new Set(prev);
          next.delete(event.node_id!);
          return next;
        });
      }
    }, [id]),
    onNodeFailed: useCallback((event: WorkflowEvent) => {
      if (event.workflow_id === id && event.node_id) {
        setExecutionEvents((prev) => [...prev, event]);
        setExecutingNodeIds((prev) => {
          const next = new Set(prev);
          next.delete(event.node_id!);
          return next;
        });
      }
    }, [id]),
  });

  // Test modal state
  const [showTestModal, setShowTestModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const { data: contactsData } = useContacts(workspaceId || '', { limit: 10 });
  const createContact = useCreateContact(workspaceId || '');

  // Load workflow data when available
  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      // Convert API nodes/edges to React Flow format
      if (workflow.nodes && canvasRef.current) {
        // Suppress onChange during data load to prevent false "unsaved changes"
        isLoadingDataRef.current = true;

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

        // Reset after React processes the state updates
        setTimeout(() => {
          isLoadingDataRef.current = false;
          setHasChanges(false);
        }, 0);
      }
    }
  }, [workflow]);

  // Load template when navigating from template picker
  useEffect(() => {
    if (!templateFromState || !isNew || !canvasRef.current) return;
    const tmpl = templateFromState as { name?: string; nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> };
    if (!tmpl.nodes) return;

    const rfNodes: Node[] = tmpl.nodes.map((n: Record<string, unknown>) => {
      const data = n.data as Record<string, unknown> | undefined;
      const nodeType = (data?.nodeType as string) || (n.type as string) || 'action';
      let rfType = 'action';
      if (nodeType.startsWith('trigger_')) rfType = 'trigger';
      else if (nodeType.startsWith('logic_')) rfType = 'logic';
      else if (nodeType.startsWith('ai_')) rfType = 'ai';
      return {
        id: n.id as string,
        type: rfType,
        position: n.position as { x: number; y: number },
        data: { ...data, nodeType },
      };
    });
    const rfEdges: Edge[] = (tmpl.edges || []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      source: e.source as string,
      target: e.target as string,
      animated: true,
    }));

    canvasRef.current.setNodes(rfNodes);
    canvasRef.current.setEdges(rfEdges);
    if (tmpl.name) setName(tmpl.name);
    setHasChanges(true);
  }, [templateFromState, isNew]);

  // Get selected node from canvas (avoids state duplication)
  const selectedNode = selectedNodeId && canvasRef.current
    ? canvasRef.current.getNodes().find(n => n.id === selectedNodeId) || null
    : null;

  // Track changes (suppressed during data load from API)
  const handleCanvasChange = useCallback(() => {
    if (!isLoadingDataRef.current) {
      setHasChanges(true);
    }
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
        const { data: created } = await api.post<Workflow>(
          `/workspaces/${effectiveWorkspaceId}/workflows`,
          input
        );
        // Activate immediately after creation (workflows start as draft)
        if (created.status === 'draft') {
          await api.put(`/workspaces/${effectiveWorkspaceId}/workflows/${created.id}`, {
            status: 'active',
          });
        }
        setHasChanges(false);
        toast.success('Workflow created and activated!');
        // Navigate to the created workflow
        navigate(`${basePath}/workflows/${created.id}`, { replace: true });
      } else {
        // Include status: active if still in draft (auto-publish on save)
        const currentStatus = workflow?.status;
        await updateWorkflow.mutateAsync({
          name,
          nodes: apiNodes,
          edges: apiEdges,
          viewport,
          ...(currentStatus === 'draft' ? { status: 'active' } : {}),
        });
        setHasChanges(false);
        toast.success(currentStatus === 'draft' ? 'Workflow saved and activated!' : 'Workflow saved!');
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // AI workflow generation
  const handleAIGenerate = async () => {
    if (!aiDescription.trim()) {
      toast.warning('Please describe what the workflow should do.');
      return;
    }

    try {
      const generatedWorkflow = await generateWorkflow.mutateAsync({
        description: aiDescription,
      });

      if (generatedWorkflow && canvasRef.current) {
        // Convert generated workflow to React Flow format
        const rfNodes: Node[] = generatedWorkflow.nodes.map((n: any) => {
          const nodeType = n.type || 'action';
          let rfType = 'action';
          if (nodeType.startsWith('trigger_')) rfType = 'trigger';
          else if (nodeType.startsWith('action_')) rfType = 'action';
          else if (nodeType.startsWith('logic_')) rfType = 'logic';
          else if (nodeType.startsWith('ai_')) rfType = 'ai';

          return {
            id: n.id,
            type: rfType,
            position: n.position,
            data: {
              label: n.label,
              nodeType: nodeType,
              config: n.config,
            },
          };
        });

        const rfEdges: Edge[] = generatedWorkflow.edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
        }));

        canvasRef.current.setNodes(rfNodes);
        canvasRef.current.setEdges(rfEdges);
        if (generatedWorkflow.name) {
          setName(generatedWorkflow.name);
        }
        setHasChanges(true);
        setShowAIModal(false);
        setAiDescription('');
        toast.success('Workflow generated! Review and customize as needed.');
      }
    } catch (error) {
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Generate a complete workflow from page context
  const handleGeneratePageWorkflow = async () => {
    if (!pageId || !workspaceId) return;

    try {
      const result = await generatePageWorkflow.mutateAsync({ page_id: pageId });

      if (result && canvasRef.current) {
        const rfNodes: Node[] = result.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        }));

        const rfEdges: Edge[] = result.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
        }));

        canvasRef.current.setNodes(rfNodes);
        canvasRef.current.setEdges(rfEdges);
        if (result.name) {
          setName(result.name);
        }
        setHasChanges(true);
        toast.success('Complete workflow generated from your page! Review and save.');
      }
    } catch (err) {
      toast.error(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    setShowTestModal(true);
  };

  const handleTestExecute = async (contactId: string) => {
    setShowTestModal(false);
    setIsTesting(true);
    try {
      const result = await executeWorkflow.mutateAsync(contactId);
      toast.success(`Workflow executed! Run ID: ${result.run_id || 'N/A'}`);
    } catch (error) {
      toast.error(`Execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestWithEmail = async () => {
    if (!testEmail.trim() || !workspaceId) return;

    // Check if contact already exists in the loaded list
    const existing = contactsData?.contacts?.find(
      (c) => c.email?.toLowerCase() === testEmail.trim().toLowerCase()
    );
    if (existing) {
      await handleTestExecute(existing.id);
      return;
    }

    // Create a new test contact
    try {
      const contact = await createContact.mutateAsync({
        email: testEmail.trim(),
        first_name: 'Test',
        last_name: 'Contact',
        tags: ['test'],
        source: 'workflow-test',
      });
      await handleTestExecute(contact.id);
    } catch (error) {
      toast.error(`Failed to create test contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            onClick={() => navigate(`${basePath}/workflows`)}
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
          {pageId && isNew && (
            <button
              onClick={handleGeneratePageWorkflow}
              disabled={generatePageWorkflow.isPending}
              className="btn bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 inline-flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              {generatePageWorkflow.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{generatePageWorkflow.isPending ? 'Generating...' : 'Auto-Generate from Page'}</span>
            </button>
          )}
          {!isNew && (
            <button
              onClick={() => {
                setTemplateName(name);
                setTemplateDescription('');
                setShowSaveTemplateModal(true);
              }}
              className="btn btn-secondary inline-flex items-center gap-2 text-sm"
            >
              <LayoutTemplate className="w-4 h-4" />
              <span className="hidden sm:inline">Save as Template</span>
            </button>
          )}
          <button
            onClick={() => setShowAIModal(true)}
            disabled={generateWorkflow.isPending}
            className="btn btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {generateWorkflow.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">AI Help</span>
          </button>
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
            workspaceId={workspaceId || undefined}
            onChange={handleCanvasChange}
            onNodeSelect={handleNodeSelect}
          />
        </div>
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            workspaceId={workspaceId}
            pageId={pageId}
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

      {/* AI Help Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">AI Workflow Builder</h3>
              </div>
              <button
                onClick={() => setShowAIModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Describe what your workflow should do. Be specific about triggers, actions, and any conditions.
              </p>
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder="Example: When a contact form is submitted, send a welcome email to the lead and notify the sales team via email. If the lead is from California, also add them to the 'West Coast' tag."
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
              <div className="text-xs text-gray-500">
                <strong>Tip:</strong> You can use variables like <code className="bg-gray-100 px-1 rounded">{"{{contact.email}}"}</code>, <code className="bg-gray-100 px-1 rounded">{"{{owner.email}}"}</code>, or <code className="bg-gray-100 px-1 rounded">{"{{trigger_data.form_data.message}}"}</code>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={generateWorkflow.isPending || !aiDescription.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {generateWorkflow.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Workflow
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Save as Template</h3>
              </div>
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="My Workflow Template"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  rows={3}
                  placeholder="What does this workflow template do?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!templateName.trim()) return;
                  try {
                    await createTemplate.mutateAsync({
                      name: templateName.trim(),
                      description: templateDescription.trim() || undefined,
                      source_workflow_id: id,
                    });
                    setShowSaveTemplateModal(false);
                    toast.success('Template saved!');
                  } catch {
                    toast.error('Failed to save template');
                  }
                }}
                disabled={createTemplate.isPending || !templateName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {createTemplate.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Log Panel */}
      {showExecutionLog && executionEvents.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 max-h-56 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
            <button
              onClick={() => setShowExecutionLog(!showExecutionLog)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700"
            >
              {showExecutionLog ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Execution Log ({executionEvents.length} events)
            </button>
            <button
              onClick={() => {
                setShowExecutionLog(false);
                setExecutionEvents([]);
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto px-4 py-2 space-y-1 font-mono text-xs">
            {executionEvents.map((evt, i) => {
              const time = new Date(evt.timestamp).toLocaleTimeString();
              const isError = evt.event.includes('failed');
              const isSuccess = evt.event === 'workflow.completed' || evt.event === 'node.completed';
              return (
                <div key={i} className={`flex items-start gap-2 ${isError ? 'text-red-600' : isSuccess ? 'text-green-600' : 'text-gray-600'}`}>
                  <span className="text-gray-400 shrink-0">{time}</span>
                  <span className="font-medium">{evt.event}</span>
                  {evt.node_id && <span className="text-gray-400">node:{evt.node_id}</span>}
                  {evt.error && <span className="text-red-500">{evt.error}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test Workflow Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">Test Workflow</h3>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Choose a contact to run this workflow against, or enter an email to create a test contact.
              </p>

              {/* Existing contacts */}
              {contactsData?.contacts && contactsData.contacts.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Existing Contacts</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                    {contactsData.contacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleTestExecute(c.id)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'No name'}
                          </div>
                          <div className="text-xs text-gray-500">{c.email || c.phone || 'No email'}</div>
                        </div>
                        <Play className="w-3 h-3 text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Or create new */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {contactsData?.contacts?.length ? 'Or enter an email' : 'Enter a test email'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTestWithEmail()}
                    placeholder="test@example.com"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                  />
                  <button
                    onClick={handleTestWithEmail}
                    disabled={!testEmail.trim() || createContact.isPending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm inline-flex items-center gap-1"
                  >
                    {createContact.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
