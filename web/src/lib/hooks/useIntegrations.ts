import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface IntegrationStatus {
  twilio: {
    connected: boolean;
    phone_number?: string;
    account_sid_masked?: string;
  };
  segment: {
    connected: boolean;
    webhook_url?: string;
  };
}

export interface TwilioConfig {
  account_sid: string;
  auth_token: string;
  phone_number: string;
}

export interface SegmentConfig {
  shared_secret: string;
}

export interface TwilioTestResult {
  success: boolean;
  message: string;
  account_name?: string;
}

export function useIntegrationStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['integrations', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<IntegrationStatus>(
        `/workspaces/${workspaceId}/integrations`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useSaveTwilioConfig(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: TwilioConfig) => {
      const { data } = await api.put(
        `/workspaces/${workspaceId}/integrations/twilio`,
        config
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceId] });
    },
  });
}

export function useSaveSegmentConfig(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: SegmentConfig) => {
      const { data } = await api.put(
        `/workspaces/${workspaceId}/integrations/segment`,
        config
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceId] });
    },
  });
}

export function useTestTwilioConnection(workspaceId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<TwilioTestResult>(
        `/workspaces/${workspaceId}/integrations/twilio/test`
      );
      return data;
    },
  });
}

export function useDisconnectIntegration(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (provider: 'twilio' | 'segment') => {
      const { data } = await api.delete(
        `/workspaces/${workspaceId}/integrations/${provider}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', workspaceId] });
    },
  });
}
