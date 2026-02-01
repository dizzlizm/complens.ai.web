import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export type DomainStatus =
  | 'pending_validation'
  | 'validating'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'deleting';

export interface Domain {
  domain: string;
  page_id: string;  // Which page this domain is connected to
  status: DomainStatus;
  status_message: string | null;
  validation_record_name: string | null;
  validation_record_value: string | null;
  cname_target: string | null;
  created_at: string | null;
  activated_at: string | null;
}

export interface DomainsResponse {
  items: Domain[];
  limit: number;
  used: number;
}

export interface CreateDomainRequest {
  domain: string;
  page_id: string;
}

export interface CreateDomainResponse {
  domain: string;
  status: string;
  status_message: string;
  validation_record: {
    type: string;
    name: string;
    value: string;
  } | null;
  instructions: string[];
}

// Fetch all domains for a workspace
export function useDomains(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['domains', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<DomainsResponse>(
        `/workspaces/${workspaceId}/domains`
      );
      return data;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      // Auto-refresh while domains are in progress
      const data = query.state.data;
      if (!data) return false;

      const hasInProgress = data.items.some(
        (d) => d.status === 'pending_validation' ||
               d.status === 'validating' ||
               d.status === 'provisioning'
      );
      return hasInProgress ? 10000 : false; // Refresh every 10s if in progress
    },
  });
}

// Get status of a specific domain
export function useDomainStatus(workspaceId: string | undefined, domain: string | undefined) {
  return useQuery({
    queryKey: ['domain', workspaceId, domain],
    queryFn: async () => {
      const { data } = await api.get<Domain>(
        `/workspaces/${workspaceId}/domains/${domain}`
      );
      return data;
    },
    enabled: !!workspaceId && !!domain,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;

      // Auto-refresh while in progress
      if (['pending_validation', 'validating', 'provisioning'].includes(status)) {
        return 10000; // Every 10 seconds
      }
      return false;
    },
  });
}

// Create a new custom domain
export function useCreateDomain(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDomainRequest) => {
      const { data } = await api.post<CreateDomainResponse>(
        `/workspaces/${workspaceId}/domains`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', workspaceId] });
    },
  });
}

// Delete a custom domain
export function useDeleteDomain(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (domain: string) => {
      await api.delete(`/workspaces/${workspaceId}/domains/${domain}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', workspaceId] });
    },
  });
}

// Helper to get status display info
export function getDomainStatusInfo(status: DomainStatus): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'pending_validation':
      return { label: 'Pending DNS', color: 'text-amber-700', bgColor: 'bg-amber-100' };
    case 'validating':
      return { label: 'Validating', color: 'text-blue-700', bgColor: 'bg-blue-100' };
    case 'provisioning':
      return { label: 'Provisioning', color: 'text-indigo-700', bgColor: 'bg-indigo-100' };
    case 'active':
      return { label: 'Active', color: 'text-green-700', bgColor: 'bg-green-100' };
    case 'failed':
      return { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-100' };
    case 'deleting':
      return { label: 'Deleting', color: 'text-gray-700', bgColor: 'bg-gray-100' };
    default:
      return { label: 'Unknown', color: 'text-gray-700', bgColor: 'bg-gray-100' };
  }
}
