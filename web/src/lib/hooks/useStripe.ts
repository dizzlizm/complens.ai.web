/**
 * Stripe Connect hooks for account connection and management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface StripeAccount {
  id: string;
  business_type: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  email: string | null;
  country: string;
  default_currency: string;
}

export interface StripeConnectStatus {
  connected: boolean;
  stripe_account_id?: string;
  livemode?: boolean;
  account?: StripeAccount | null;
  error?: string;
  message?: string;
}

interface StartConnectResponse {
  oauth_url: string;
  message: string;
}

interface DisconnectResponse {
  disconnected: boolean;
  message: string;
}

/**
 * Hook to get Stripe Connect status for a workspace.
 */
export function useStripeConnectStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['stripe', 'status', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<StripeConnectStatus>(
        `/workspaces/${workspaceId}/stripe/connect/status`
      );
      return data;
    },
    enabled: !!workspaceId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to start Stripe Connect OAuth flow.
 */
export function useStartStripeConnect() {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      redirectUri,
    }: {
      workspaceId: string;
      redirectUri: string;
    }) => {
      const { data } = await api.post<StartConnectResponse>(
        `/workspaces/${workspaceId}/stripe/connect/start`,
        { redirect_uri: redirectUri }
      );
      return data;
    },
    onSuccess: () => {
      // Redirect happens after this, so no cache invalidation needed
    },
  });
}

/**
 * Hook to disconnect Stripe account.
 */
export function useDisconnectStripe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspaceId }: { workspaceId: string }) => {
      const { data } = await api.post<DisconnectResponse>(
        `/workspaces/${workspaceId}/stripe/connect/disconnect`,
        { confirm: true }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['stripe', 'status', variables.workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspaces', variables.workspaceId],
      });
    },
  });
}

export default useStripeConnectStatus;
