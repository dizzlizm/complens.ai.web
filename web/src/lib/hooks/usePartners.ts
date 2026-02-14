import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface Partner {
  id: string;
  workspace_id: string;
  title: string;
  value: number;
  commission_pct: number;
  partner_type: 'msp' | 'referral' | 'agency' | 'affiliate' | 'other';
  stage: string;
  contact_id?: string;
  contact_name?: string;
  introduced_by?: string;
  introduced_by_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  custom_fields: Record<string, unknown>;
  inactive_reason?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PartnerPipelineData {
  stages: string[];
  partners: Partner[];
  summary: {
    total_partners: number;
    total_value: number;
    by_stage: Record<string, { count: number; value: number }>;
  };
}

export interface CreatePartnerInput {
  title: string;
  value?: number;
  commission_pct?: number;
  partner_type?: 'msp' | 'referral' | 'agency' | 'affiliate' | 'other';
  stage?: string;
  contact_id?: string;
  contact_name?: string;
  introduced_by?: string;
  introduced_by_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  position?: number;
}

export interface UpdatePartnerInput {
  title?: string;
  value?: number;
  commission_pct?: number;
  partner_type?: 'msp' | 'referral' | 'agency' | 'affiliate' | 'other';
  stage?: string;
  contact_id?: string;
  contact_name?: string;
  introduced_by?: string;
  introduced_by_name?: string;
  owner_id?: string;
  owner_name?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  inactive_reason?: string;
  position?: number;
}

// Fetch all partners with pipeline data
export function usePartners(workspaceId: string) {
  return useQuery({
    queryKey: ['partners', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<PartnerPipelineData>(
        `/workspaces/${workspaceId}/partners`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Create a new partner
export function useCreatePartner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePartnerInput) => {
      const { data } = await api.post<Partner>(
        `/workspaces/${workspaceId}/partners`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners', workspaceId] });
    },
  });
}

// Update a partner
export function useUpdatePartner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ partnerId, ...input }: UpdatePartnerInput & { partnerId: string }) => {
      const { data } = await api.put<Partner>(
        `/workspaces/${workspaceId}/partners/${partnerId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners', workspaceId] });
    },
  });
}

// Delete a partner
export function useDeletePartner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (partnerId: string) => {
      await api.delete(`/workspaces/${workspaceId}/partners/${partnerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners', workspaceId] });
    },
  });
}

// Move a partner to a new stage (with optimistic update for smooth drag)
export function useMovePartner(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ partnerId, stage, position }: { partnerId: string; stage: string; position: number }) => {
      const { data } = await api.put<Partner>(
        `/workspaces/${workspaceId}/partners/${partnerId}/move`,
        { stage, position }
      );
      return data;
    },
    onMutate: async ({ partnerId, stage, position }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['partners', workspaceId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<PartnerPipelineData>(['partners', workspaceId]);

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<PartnerPipelineData>(['partners', workspaceId], {
          ...previous,
          partners: previous.partners.map((p) =>
            p.id === partnerId ? { ...p, stage, position } : p
          ),
        });
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['partners', workspaceId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['partners', workspaceId] });
    },
  });
}

// Fetch partners linked to a specific contact
export function useContactPartners(workspaceId: string, contactId: string | undefined) {
  return useQuery({
    queryKey: ['contact-partners', workspaceId, contactId],
    queryFn: async () => {
      const { data } = await api.get<PartnerPipelineData>(
        `/workspaces/${workspaceId}/partners`,
        { params: { contact_id: contactId } }
      );
      return data;
    },
    enabled: !!workspaceId && !!contactId,
  });
}

// Get pipeline config
export function usePartnerPipelineConfig(workspaceId: string) {
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
export function useUpdatePartnerPipeline(workspaceId: string) {
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
      queryClient.invalidateQueries({ queryKey: ['partners', workspaceId] });
    },
  });
}
