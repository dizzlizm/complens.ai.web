import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export type WarmupStatus = 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface WarmupDomain {
  domain: string;
  status: WarmupStatus;
  warmup_day: number;
  daily_limit: number;
  schedule_length: number;
  schedule: number[];
  total_sent: number;
  total_bounced: number;
  total_complaints: number;
  bounce_rate: number;
  complaint_rate: number;
  total_delivered: number;
  total_opens: number;
  open_rate: number;
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
  from_email_local: string | null;
  from_email_verified: boolean;
  reply_to: string | null;
  reply_to_verified: boolean;
  today?: {
    send_count: number;
    bounce_count: number;
    complaint_count: number;
    delivery_count: number;
    open_count: number;
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
  from_email_local?: string;
  reply_to?: string;
}

export interface UpdateSeedListRequest {
  seed_list: string[];
  auto_warmup_enabled: boolean;
  from_name?: string;
  from_email_local?: string;
}

export interface UpdateWarmupSettingsRequest {
  send_window_start?: number;
  send_window_end?: number;
  max_bounce_rate?: number;
  max_complaint_rate?: number;
  schedule?: number[];
}

export interface WarmupLogEntry {
  subject: string;
  recipient: string;
  from_email: string;
  content_type: string;
  sent_at: string;
}

export interface WarmupLogResponse {
  items: WarmupLogEntry[];
  today?: {
    send_count: number;
    daily_limit: number;
  };
  warmup?: {
    auto_warmup_enabled: boolean;
    seed_list_count: number;
    send_window_start: number;
    send_window_end: number;
  };
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

export interface DnsRecord {
  type: 'TXT' | 'CNAME';
  name: string;
  value: string;
  purpose: 'domain_verification' | 'dkim' | 'spf' | 'dmarc' | 'landing_page';
  status?: 'verified' | 'pending';
  recommended?: boolean;
}

export interface DomainSetupResult {
  domain: string;
  verification_token: string;
  dkim_tokens: string[];
  dns_records: DnsRecord[];
  verified: boolean;
  dkim_enabled: boolean;
  dkim_status: string | null;
  spf_valid?: boolean;
  dmarc_valid?: boolean;
  ready: boolean;
  created_at?: string;
}

export interface SavedDomainsResponse {
  items: DomainSetupResult[];
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

// Update warmup settings (send window, thresholds, remaining schedule)
export function useUpdateWarmupSettings(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain, ...input }: UpdateWarmupSettingsRequest & { domain: string }) => {
      const { data } = await api.put<WarmupDomain>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/settings`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Send a test warmup email
export function useSendWarmupTestEmail(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain, recipient }: { domain: string; recipient?: string }) => {
      const { data } = await api.post<{
        subject: string;
        content_type: string;
        recipient: string;
        message_id: string;
      }>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/send-test`,
        recipient ? { recipient } : {}
      );
      return data;
    },
    onSuccess: (_, { domain }) => {
      queryClient.invalidateQueries({ queryKey: ['warmup-log', workspaceId, domain] });
    },
  });
}

// Delete a saved domain (email warmup setup)
export function useDeleteSavedDomain(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      await api.delete(`/workspaces/${workspaceId}/email-warmup/domains/${domain}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-domains', workspaceId] });
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
    staleTime: 0, // Always refetch — SES verification status changes asynchronously
  });
}

// List all configured/saved domains for a workspace
export function useListDomains(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['saved-domains', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<SavedDomainsResponse>(
        `/workspaces/${workspaceId}/email-warmup/domains`
      );
      return data;
    },
    enabled: !!workspaceId,
    staleTime: 0, // Always refetch — verification status can change any time via DNS propagation
  });
}

// Set up a domain for SES sending (verify identity + DKIM)
export function useSetupDomain(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      const { data } = await api.post<DomainSetupResult>(
        `/workspaces/${workspaceId}/email-warmup/setup-domain`,
        { domain }
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['domain-auth', workspaceId, data.domain] });
      queryClient.invalidateQueries({ queryKey: ['saved-domains', workspaceId] });
    },
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

// Send from-email verification code
export function useVerifyFromEmail(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain, from_email_local }: { domain: string; from_email_local: string }) => {
      const { data } = await api.post<{ sent_to: string }>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/verify-from-email`,
        { from_email_local }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Check SES from-email verification status
export function useConfirmFromEmail(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain }: { domain: string }) => {
      const { data } = await api.post<WarmupDomain | { verified: boolean; ses_status: string; email: string }>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/confirm-from-email`,
        {}
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Verify a sender email address (workspace-level, not domain-scoped)
export function useVerifySender(workspaceId: string) {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await api.post<{ sent_to: string }>(
        `/workspaces/${workspaceId}/email-warmup/verify-sender`,
        { email }
      );
      return data;
    },
  });
}

// Check sender email verification status (workspace-level)
export function useCheckSender(workspaceId: string) {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await api.post<{ verified: boolean; ses_status: string; email: string }>(
        `/workspaces/${workspaceId}/email-warmup/check-sender`,
        { email }
      );
      return data;
    },
  });
}

// Send reply-to verification email
export function useVerifyReplyTo(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain, reply_to }: { domain: string; reply_to: string }) => {
      const { data } = await api.post<{ sent_to: string }>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/verify-reply-to`,
        { reply_to }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warmups', workspaceId] });
    },
  });
}

// Check reply-to verification status
export function useCheckReplyTo(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ domain }: { domain: string }) => {
      const { data } = await api.post<{ verified: boolean; reply_to: string }>(
        `/workspaces/${workspaceId}/email-warmup/${domain}/check-reply-to`,
        {}
      );
      return data;
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
