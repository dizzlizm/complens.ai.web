import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface CustomWorkflowTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface CreateWorkflowTemplateInput {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  source_workflow_id?: string;
}

export function useWorkflowTemplates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-templates', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: CustomWorkflowTemplate[] }>(
        `/workspaces/${workspaceId}/workflow-templates`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateWorkflowTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkflowTemplateInput) => {
      const { data } = await api.post<CustomWorkflowTemplate>(
        `/workspaces/${workspaceId}/workflow-templates`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', workspaceId] });
    },
  });
}

export function useDeleteWorkflowTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      await api.delete(`/workspaces/${workspaceId}/workflow-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-templates', workspaceId] });
    },
  });
}
