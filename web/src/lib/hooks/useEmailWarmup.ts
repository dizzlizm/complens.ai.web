import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export type WarmupStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface WarmupDomain {
  domain: string;
  status: WarmupStatus;
  warmup_day: number;
  daily_limit: number;
  schedule_length: number;
  total_sent: number;
  total_bounced: number;
  total_complaints: number;
  bounce_rate: number;
  complaint_rate: number;
  max_bounce_rate: number;
  max_complaint_rate: number;
  started_at: string | null;
  pause_reason: string | null;
  today?: {
    send_count: number;
    bounce_count: number;
    complaint_count: number;
    daily_limit: number;
  };
}

export interface WarmupListResponse {
  items: WarmupDomain[];
}

export interface StartWarmupRequest {
  domain: string;
  schedule?: number[];
  max_bounce_rate?: number;
  max_complaint_rate?: number;
}

// List all warm-up domains for a workspace
export function useWarmups(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['warmups', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<WarmupListResponse>(
        `/workspaces/${workspaceId}/email-warmup`
      );
      return data;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasActive = data.items.some((w) => w.status === 'active');
      return hasActive ? 30000 : false; // Refresh every 30s if active warmups
    },
  });
}

// Start a warm-up for a domain
export function useStartWarmup(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartWarmupRequest) => {
      const { data } = await api.post<WarmupDomain>(
        `/workspaces/${workspaceId}/email-warmup`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Pause a warm-up
export function usePauseWarmup(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      const { data } = await api.post<WarmupDomain>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/pause`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Resume a paused warm-up
export function useResumeWarmup(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      const { data } = await api.post<WarmupDomain>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/resume`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Cancel (delete) a warm-up
export function useCancelWarmup(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      await api.delete(`/workspaces/${workspaceId}/email-warmup/${domain}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Helper to get status display info
export function getWarmupStatusInfo(status: WarmupStatus): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'paused':
      return { label: 'Paused', color: 'text-amber-700', bgColor: 'bg-amber-100' };
    case 'completed':
      return { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' };
    case 'pending':
      return { label: 'Pending', color: 'text-gray-700', bgColor: 'bg-gray-100' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-red-700', bgColor: 'bg-red-100' };
    default:
      return { label: 'Unknown', color: 'text-gray-700', bgColor: 'bg-gray-100' };
  }
}
