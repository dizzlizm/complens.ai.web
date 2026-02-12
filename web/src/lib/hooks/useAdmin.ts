import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

// Types
export interface AdminWorkspace {
  id: string;
  name: string;
  agency_id: string;
  plan: string;
  subscription_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminWorkspaceDetail extends AdminWorkspace {
  stripe_customer_id: string | null;
  notification_email: string | null;
  twilio_phone: string | null;
  is_active: boolean;
  trial_ends_at: string | null;
  plan_period_end: string | null;
  has_twilio: boolean;
  has_sendgrid: boolean;
}

export interface WorkspaceStats {
  contacts: number;
  pages: number;
  workflows: number;
  forms: number;
  documents: number;
  sites: number;
  team_members: number;
  deals: number;
  conversations: number;
  workflow_runs: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

export interface UserStats {
  workspace_count: number;
  total_contacts: number;
  total_pages: number;
  total_workflows: number;
  total_forms: number;
}

export interface BedrockModelMetrics {
  invocations: number;
  input_tokens: number;
  output_tokens: number;
}

export interface LambdaFunctionMetrics {
  invocations: number;
  duration_ms: number;
  errors: number;
}

// Usage metrics from CloudWatch (available immediately)
export interface UsageMetrics {
  period: string;
  start_time: string;
  end_time: string;
  bedrock: {
    models: Record<string, BedrockModelMetrics>;
    total_invocations: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  lambda: {
    functions: Record<string, LambdaFunctionMetrics>;
    total_invocations: number;
    total_duration_ms: number;
    total_errors: number;
  };
  dynamodb: {
    consumed_read_units: number;
    consumed_write_units: number;
  };
  api_gateway: {
    request_count: number;
    '4xx_errors': number;
    '5xx_errors': number;
  };
  step_functions: {
    executions_started: number;
    executions_succeeded: number;
    executions_failed: number;
  };
}

// Service cost from Cost Explorer
export interface ServiceCost {
  aws_services: string[];
  cost: number;
}

// Actual costs from Cost Explorer (has 24-48 hour delay)
export interface ActualCosts {
  period: string;
  start_date: string;
  end_date: string;
  services: Record<string, ServiceCost>;
  total_cost: number;
  total_cost_formatted: string;
  currency: string;
  data_delay_note: string;
  error?: string;
}

export interface PlatformStats {
  total_workspaces: number;
  total_contacts: number;
  total_pages: number;
  total_workflows: number;
  total_forms: number;
  workspaces_with_twilio: number;
  workspaces_with_sendgrid: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  status: string;
  enabled: boolean;
  agency_id?: string;
  workspace_ids?: string[];
  is_super_admin?: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface BillingSummary {
  total_workspaces: number;
  active_subscriptions: number;
  plan_counts: {
    free: number;
    pro: number;
    business: number;
  };
  mrr: number;
  mrr_formatted: string;
}

export interface QueueHealth {
  messages: number;
  in_flight: number;
  delayed: number;
  error?: string;
}

export interface SystemHealth {
  queues: Record<string, QueueHealth>;
  status: 'healthy' | 'degraded' | 'unhealthy';
}

// Hooks

export function useAdminWorkspaces(params?: { limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: ['admin', 'workspaces', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.cursor) searchParams.set('cursor', params.cursor);

      const { data } = await api.get<{
        workspaces: AdminWorkspace[];
        next_cursor: string | null;
        count: number;
      }>(`/admin/workspaces?${searchParams.toString()}`);
      return data;
    },
  });
}

export function useAdminWorkspace(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'workspace', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{
        workspace: AdminWorkspaceDetail;
        owner: AdminUser | null;
      }>(`/admin/workspaces/${workspaceId}`);
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useUpdateAdminWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<{ plan: string; subscription_status: string; name: string }>) => {
      const { data } = await api.put<{ workspace: AdminWorkspaceDetail }>(
        `/admin/workspaces/${workspaceId}`,
        updates
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId] });
    },
  });
}

export function useAdminUsers(params?: { limit?: number; cursor?: string; filter?: string }) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      if (params?.cursor) searchParams.set('cursor', params.cursor);
      if (params?.filter) searchParams.set('filter', params.filter);

      const { data } = await api.get<{
        users: AdminUser[];
        next_cursor: string | null;
        count: number;
      }>(`/admin/users?${searchParams.toString()}`);
      return data;
    },
  });
}

export function useAdminUser(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: async () => {
      const { data } = await api.get<{
        user: AdminUser;
        workspaces: Array<{ id: string; name: string; plan: string }>;
      }>(`/admin/users/${userId}`);
      return data;
    },
    enabled: !!userId,
  });
}

export function useDisableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{ message: string; user_id: string }>(
        `/admin/users/${userId}/disable`
      );
      return data;
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    },
  });
}

export function useEnableUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{ message: string; user_id: string }>(
        `/admin/users/${userId}/enable`
      );
      return data;
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    },
  });
}

export function useBillingSummary() {
  return useQuery({
    queryKey: ['admin', 'billing', 'summary'],
    queryFn: async () => {
      const { data } = await api.get<BillingSummary>('/admin/billing/summary');
      return data;
    },
    // Refetch every 5 minutes
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['admin', 'system', 'health'],
    queryFn: async () => {
      const { data } = await api.get<SystemHealth>('/admin/system/health');
      return data;
    },
    // Refetch every 30 seconds
    refetchInterval: 30 * 1000,
  });
}

export function useWorkspaceStats(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'workspace', workspaceId, 'stats'],
    queryFn: async () => {
      const { data } = await api.get<WorkspaceStats>(
        `/admin/workspaces/${workspaceId}/stats`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useUserStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'user', userId, 'stats'],
    queryFn: async () => {
      const { data } = await api.get<UserStats>(`/admin/users/${userId}/stats`);
      return data;
    },
    enabled: !!userId,
  });
}

export function useUsageMetrics(period: string = '24h') {
  return useQuery({
    queryKey: ['admin', 'costs', 'usage', period],
    queryFn: async () => {
      const { data } = await api.get<UsageMetrics>(
        `/admin/costs/usage?period=${period}`
      );
      return data;
    },
    // Refetch every 5 minutes
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useActualCosts(period: string = '24h') {
  return useQuery({
    queryKey: ['admin', 'costs', 'actual', period],
    queryFn: async () => {
      const { data } = await api.get<ActualCosts>(
        `/admin/costs/actual?period=${period}`
      );
      return data;
    },
    // Refetch every 10 minutes (data updates slowly anyway)
    refetchInterval: 10 * 60 * 1000,
    // Don't show stale indicator during background refetch
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ['admin', 'stats', 'platform'],
    queryFn: async () => {
      const { data } = await api.get<PlatformStats>('/admin/stats/platform');
      return data;
    },
    // Refetch every 5 minutes
    refetchInterval: 5 * 60 * 1000,
  });
}

// Workspace member types
export interface WorkspaceMember {
  user_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string | null;
}

export interface WorkspaceInvitation {
  email: string;
  role: string;
  invited_by: string;
  expires_at: string | null;
}

// Delete workspace
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data } = await api.delete<{
        message: string;
        workspace_id: string;
        deleted_items: number;
      }>(`/admin/workspaces/${workspaceId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
    },
  });
}

// Delete user
export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.delete<{
        message: string;
        user_id: string;
        deleted_workspaces: string[];
        removed_from_workspaces: string[];
      }>(`/admin/users/${userId}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
    },
  });
}

// List workspace members
export function useWorkspaceMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'workspace', workspaceId, 'members'],
    queryFn: async () => {
      const { data } = await api.get<{
        members: WorkspaceMember[];
        invitations: WorkspaceInvitation[];
      }>(`/admin/workspaces/${workspaceId}/members`);
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Add member to workspace
export function useAddWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      const { data } = await api.post<{ member: WorkspaceMember }>(
        `/admin/workspaces/${workspaceId}/members`,
        { user_id, role }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId, 'members'] });
    },
  });
}

// Update member role
export function useUpdateWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data } = await api.put<{ member: WorkspaceMember }>(
        `/admin/workspaces/${workspaceId}/members/${userId}`,
        { role }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId, 'members'] });
    },
  });
}

// Remove member from workspace
export function useRemoveWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.delete<{ message: string }>(
        `/admin/workspaces/${workspaceId}/members/${userId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'workspace', workspaceId, 'members'] });
    },
  });
}

// Toggle super admin
export function useToggleSuperAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{ user_id: string; is_super_admin: boolean }>(
        `/admin/users/${userId}/toggle-super-admin`
      );
      return data;
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    },
  });
}

// Plan config types
export interface AdminPlanConfig {
  id: string;
  plan_key: string;
  display_name: string;
  price_monthly: number;
  stripe_price_id: string | null;
  description: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  feature_list: string[];
  highlighted: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const { data } = await api.get<{ plans: AdminPlanConfig[] }>('/admin/plans');
      return data.plans;
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ planKey, ...updates }: { planKey: string } & Partial<AdminPlanConfig>) => {
      const { data } = await api.put<AdminPlanConfig>(
        `/admin/plans/${planKey}`,
        updates
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      queryClient.invalidateQueries({ queryKey: ['plans'] }); // invalidate public plans cache too
    },
  });
}
