import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface Deal {
  id: string;
  workspace_id: string;
  title: string;
  value: number;
  stage: string;
  contact_id?: string;
  contact_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  expected_close_date?: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  lost_reason?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PipelineData {
  stages: string[];
  deals: Deal[];
  summary: {
    total_deals: number;
    total_value: number;
    by_stage: Record<string, { count: number; value: number }>;
  };
}

export interface CreateDealInput {
  title: string;
  value?: number;
  stage?: string;
  contact_id?: string;
  contact_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  expected_close_date?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  position?: number;
}

export interface UpdateDealInput {
  title?: string;
  value?: number;
  stage?: string;
  contact_id?: string;
  contact_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  expected_close_date?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  lost_reason?: string;
  position?: number;
}

// Fetch all deals with pipeline data
export function useDeals(workspaceId: string) {
  return useQuery({
    queryKey: ['deals', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<PipelineData>(
        `/workspaces/${workspaceId}/deals`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Create a new deal
export function useCreateDeal(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDealInput) => {
      const { data } = await api.post<Deal>(
        `/workspaces/${workspaceId}/deals`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] });
    },
  });
}

// Update a deal
export function useUpdateDeal(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, ...input }: UpdateDealInput & { dealId: string }) => {
      const { data } = await api.put<Deal>(
        `/workspaces/${workspaceId}/deals/${dealId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] });
    },
  });
}

// Delete a deal
export function useDeleteDeal(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      await api.delete(`/workspaces/${workspaceId}/deals/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] });
    },
  });
}

// Move a deal to a new stage (with optimistic update for smooth drag)
export function useMoveDeal(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, stage, position }: { dealId: string; stage: string; position: number }) => {
      const { data } = await api.put<Deal>(
        `/workspaces/${workspaceId}/deals/${dealId}/move`,
        { stage, position }
      );
      return data;
    },
    onMutate: async ({ dealId, stage, position }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['deals', workspaceId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<PipelineData>(['deals', workspaceId]);

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<PipelineData>(['deals', workspaceId], {
          ...previous,
          deals: previous.deals.map((d) =>
            d.id === dealId ? { ...d, stage, position } : d
          ),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['deals', workspaceId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] });
    },
  });
}

// Get pipeline config
export function usePipelineConfig(workspaceId: string) {
  return useQuery({
    queryKey: ['pipeline-config', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ stages: string[] }>(
        `/workspaces/${workspaceId}/pipeline`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Update pipeline config
export function useUpdatePipeline(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stages: string[]) => {
      const { data } = await api.put<{ stages: string[] }>(
        `/workspaces/${workspaceId}/pipeline`,
        { stages }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-config', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['deals', workspaceId] });
    },
  });
}
