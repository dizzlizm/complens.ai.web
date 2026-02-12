import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  builtin?: boolean;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  source_workflow_id?: string;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}

export function useWorkflowTemplates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-templates', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: WorkflowTemplate[] }>(
        `/workspaces/${workspaceId}/workflow-templates`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data } = await api.post<WorkflowTemplate>(
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

export function useDeleteTemplate(workspaceId: string) {
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
