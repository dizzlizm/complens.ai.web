import { useQuery } from '@tanstack/react-query';
import api from '../api';

export interface AnalyticsSummary {
  total_contacts: number;
  contacts_in_period: number;
  contact_trend: number;
  total_workflows: number;
  active_workflows: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
}

export interface TimeSeriesPoint {
  date: string;
  count?: number;
  success?: number;
  failed?: number;
}

export interface WorkflowPerformance {
  name: string;
  total: number;
  success: number;
  failed: number;
  success_rate: number;
}

export interface AnalyticsData {
  period: string;
  summary: AnalyticsSummary;
  contact_growth: TimeSeriesPoint[];
  workflow_runs: TimeSeriesPoint[];
  top_workflows: WorkflowPerformance[];
}

export function useAnalytics(workspaceId: string | undefined, period: string = '30d') {
  return useQuery({
    queryKey: ['analytics', workspaceId, period],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsData>(
        `/workspaces/${workspaceId}/analytics?period=${period}`
      );
      return data;
    },
    enabled: !!workspaceId,
    refetchInterval: 60000, // Refresh every minute
  });
}
