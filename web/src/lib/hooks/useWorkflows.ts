import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    nodeType: string;
    config: Record<string, unknown>;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  source_handle?: string;
  target_handle?: string;
}

export interface Workflow {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
  runs_count?: number;
  last_run_at?: string;
}

// CreateWorkflowInput - matches backend CreateWorkflowRequest exactly
// Backend fields: name, description, nodes, edges, viewport, settings
// Note: trigger_type/trigger_config are NOT backend fields - they're derived from the trigger node
export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  settings?: Record<string, unknown>;
}

// UpdateWorkflowInput - matches backend UpdateWorkflowRequest exactly
export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'paused' | 'archived';
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  trigger_config?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

// Fetch all workflows for a workspace
export function useWorkflows(workspaceId: string) {
  return useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Workflow[] }>(
        `/workspaces/${workspaceId}/workflows`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

// Fetch a single workflow
export function useWorkflow(workspaceId: string, workflowId: string) {
  return useQuery({
    queryKey: ['workflow', workspaceId, workflowId],
    queryFn: async () => {
      const { data } = await api.get<Workflow>(
        `/workspaces/${workspaceId}/workflows/${workflowId}`
      );
      return data;
    },
    enabled: !!workspaceId && !!workflowId && workflowId !== 'new',
  });
}

// Create a new workflow
export function useCreateWorkflow(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkflowInput) => {
      const { data } = await api.post<Workflow>(
        `/workspaces/${workspaceId}/workflows`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] });
    },
  });
}

// Update a workflow
export function useUpdateWorkflow(workspaceId: string, workflowId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateWorkflowInput) => {
      const { data } = await api.put<Workflow>(
        `/workspaces/${workspaceId}/workflows/${workflowId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', workspaceId, workflowId] });
    },
  });
}

// Delete a workflow
export function useDeleteWorkflow(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workflowId: string) => {
      await api.delete(`/workspaces/${workspaceId}/workflows/${workflowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] });
    },
  });
}

// Execute a workflow
export function useExecuteWorkflow(workspaceId: string, workflowId: string) {
  return useMutation({
    mutationFn: async (contactId?: string) => {
      const { data } = await api.post(
        `/workspaces/${workspaceId}/workflows/${workflowId}/execute`,
        { contact_id: contactId }
      );
      return data;
    },
  });
}
