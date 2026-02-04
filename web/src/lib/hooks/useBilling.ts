import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../api';

export interface UsageInfo {
  current: number;
  limit: number | 'unlimited';
  percentage: number;
}

export interface BillingStatus {
  plan: string;
  subscription_status: string | null;
  has_stripe_customer: boolean;
  usage: Record<string, UsageInfo | { enabled: boolean }>;
}

export function useBillingStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['billing', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<BillingStatus>(
        `/workspaces/${workspaceId}/billing`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateCheckout(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: { price_id: string; success_url?: string; cancel_url?: string }) => {
      const { data } = await api.post<{ session_id: string; url: string }>(
        `/workspaces/${workspaceId}/billing/checkout`,
        input
      );
      return data;
    },
  });
}

export function useCreatePortal(workspaceId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ url: string }>(
        `/workspaces/${workspaceId}/billing/portal`
      );
      return data;
    },
  });
}
