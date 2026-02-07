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

export interface PagePerformance {
  id: string;
  name: string;
  slug: string;
  views: number;
  submissions: number;
  chats: number;
  conversion_rate: number;
}

export interface PageAnalyticsData {
  total_page_views: number;
  total_form_submissions: number;
  total_chat_sessions: number;
  overall_conversion_rate: number;
  top_pages: PagePerformance[];
}

export interface FormPerformance {
  id: string;
  name: string;
  page_name: string;
  submissions: number;
}

export interface FormAnalyticsData {
  total_submissions: number;
  top_forms: FormPerformance[];
}

export interface RecentActivityItem {
  id: string;
  type: 'workflow_run' | 'form_submission' | 'contact_created';
  title: string;
  description?: string;
  status?: 'success' | 'failed' | 'running';
  timestamp: string;
  link?: string;
}

export interface AnalyticsData {
  period: string;
  summary: AnalyticsSummary;
  contact_growth: TimeSeriesPoint[];
  workflow_runs: TimeSeriesPoint[];
  top_workflows: WorkflowPerformance[];
  page_analytics?: PageAnalyticsData;
  form_analytics?: FormAnalyticsData;
  recent_activity?: RecentActivityItem[];
}

export function useAnalytics(workspaceId: string | undefined, period: string = '30d') {
  return useQuery({
    queryKey: ['analytics', workspaceId, period],
    queryFn: async () => {
      const { data } = await api.get<AnalyticsData>(
        `/workspaces/${workspaceId}/analytics?period=${period}&include=pages,forms,activity`
      );
      return data;
    },
    enabled: !!workspaceId,
    refetchInterval: 60000,
  });
}
