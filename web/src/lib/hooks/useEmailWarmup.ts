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
  total_delivered: number;
  total_opens: number;
  total_clicks: number;
  open_rate: number;
  click_rate: number;
  total_replies: number;
  reply_rate: number;
  send_window_start: number;
  send_window_end: number;
  low_engagement_warning: boolean;
  max_bounce_rate: number;
  max_complaint_rate: number;
  started_at: string | null;
  pause_reason: string | null;
  seed_list: string[];
  auto_warmup_enabled: boolean;
  from_name: string | null;
  today?: {
    send_count: number;
    bounce_count: number;
    complaint_count: number;
    delivery_count: number;
    open_count: number;
    click_count: number;
    reply_count: number;
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
  send_window_start?: number;
  send_window_end?: number;
  seed_list?: string[];
  auto_warmup_enabled?: boolean;
  from_name?: string;
}

export interface UpdateSeedListRequest {
  seed_list: string[];
  auto_warmup_enabled: boolean;
  from_name?: string;
}

export interface WarmupLogEntry {
  subject: string;
  recipient: string;
  content_type: string;
  sent_at: string;
}

export interface WarmupLogResponse {
  items: WarmupLogEntry[];
}

export interface DomainAuthStatus {
  domain: string;
  verified: boolean;
  dkim_enabled: boolean;
  dkim_status: string | null;
  dkim_tokens: string[];
  ready: boolean;
  error?: string;
}

export interface DomainHealthResult {
  domain: string;
  score: number;
  status: 'good' | 'warning' | 'critical';
  spf_valid: boolean;
  spf_record: string | null;
  dkim_enabled: boolean;
  dmarc_valid: boolean;
  dmarc_record: string | null;
  dmarc_policy: string | null;
  mx_valid: boolean;
  mx_hosts: string[];
  blacklisted: boolean;
  blacklist_listings: string[];
  bounce_rate: number;
  complaint_rate: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  score_breakdown: Record<string, number>;
  checked_at: string | null;
  cached: boolean;
  errors: string[];
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

// Update seed list and auto-warmup configuration
export function useUpdateSeedList(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain, ...input }: UpdateSeedListRequest & { domain: string }) => {
      const { data } = await api.put<WarmupDomain>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/seed-list`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Get warmup email log
export function useWarmupLog(workspaceId: string | undefined, domain: string | undefined) {
  return useQuery({
    queryKey: ['warmup-log', workspaceId, domain],
    queryFn: async () => {
      const { data } = await api.get<WarmupLogResponse>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/warmup-log`
      );
      return data;
    },
    enabled: !!workspaceId && !!domain,
    staleTime: 30000,
  });
}

// Check domain authentication status
export function useCheckDomainAuth(workspaceId: string | undefined, domain: string | undefined) {
  return useQuery({
    queryKey: ['domain-auth', workspaceId, domain],
    queryFn: async () => {
      const { data } = await api.get<DomainAuthStatus>(
        `/workspaces/${workspaceId}/email-warmup/check-domain`,
        { params: { domain } }
      );
      return data;
    },
    enabled: !!workspaceId && !!domain && domain.includes('.'),
    staleTime: 30000, // Cache for 30s
  });
}

// Get domain health check
export function useDomainHealth(
  workspaceId: string | undefined,
  domain: string | undefined,
  enabled: boolean = false,
) {
  return useQuery({
    queryKey: ['domain-health', workspaceId, domain],
    queryFn: async () => {
      const { data } = await api.get<DomainHealthResult>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/domain-health`
      );
      return data;
    },
    enabled: !!workspaceId && !!domain && enabled,
    staleTime: 5 * 60 * 1000, // 5 min (matches server cache TTL)
    refetchOnWindowFocus: false,
  });
}

// Helper to get health status display info
export function getHealthStatusInfo(status: 'good' | 'warning' | 'critical'): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'good':
      return { label: 'Good', color: 'text-green-700', bgColor: 'bg-green-100' };
    case 'warning':
      return { label: 'Warning', color: 'text-amber-700', bgColor: 'bg-amber-100' };
    case 'critical':
      return { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100' };
    default:
      return { label: 'Unknown', color: 'text-gray-700', bgColor: 'bg-gray-100' };
  }
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
