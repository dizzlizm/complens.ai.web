import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  GitBranch,
  TrendingUp,
  CheckCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useCurrentWorkspace, useAnalytics } from '../lib/hooks';
import StatCard from '../components/dashboard/StatCard';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';
import RecentActivity from '../components/dashboard/RecentActivity';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function Analytics() {
  const [period, setPeriod] = useState('30d');
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: analytics, isLoading, error } = useAnalytics(workspaceId, period);

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-3" />
        <h3 className="text-lg font-medium text-red-800 mb-1">Failed to load analytics</h3>
        <p className="text-red-600">Something went wrong while fetching analytics data.</p>
      </div>
    );
  }

  const summary = analytics?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-gray-500">Track performance across your workspace</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="input w-full sm:w-44"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Contacts"
          value={summary?.total_contacts?.toLocaleString() ?? '-'}
          icon={Users}
          trend={summary?.contact_trend}
          trendLabel="vs prior period"
        />
        <StatCard
          label="New Contacts"
          value={summary?.contacts_in_period?.toLocaleString() ?? '-'}
          icon={TrendingUp}
          trendLabel={`in ${period}`}
        />
        <StatCard
          label="Active Workflows"
          value={summary?.active_workflows ?? '-'}
          icon={GitBranch}
          trendLabel={`of ${summary?.total_workflows ?? 0} total`}
        />
        <StatCard
          label="Success Rate"
          value={summary?.success_rate != null ? `${Math.round(summary.success_rate)}%` : '-'}
          icon={CheckCircle}
          trendLabel={`${summary?.successful_runs ?? 0} of ${summary?.total_runs ?? 0} runs`}
        />
      </div>

      {/* Contact Growth Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Growth</h2>
        <AnalyticsChart
          type="area"
          data={analytics?.contact_growth || []}
          dataKeys={[
            { key: 'count', color: '#6366f1', name: 'Contacts' },
          ]}
          height={300}
        />
      </div>

      {/* Workflow Runs Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Workflow Runs</h2>
        <AnalyticsChart
          type="bar"
          data={analytics?.workflow_runs || []}
          dataKeys={[
            { key: 'success', color: '#22c55e', name: 'Succeeded' },
            { key: 'failed', color: '#ef4444', name: 'Failed' },
          ]}
          stacked
          height={300}
        />
      </div>

      {/* Top Workflows Table */}
      {analytics?.top_workflows && analytics.top_workflows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Top Workflows</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workflow</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Runs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Succeeded</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Failed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.top_workflows.map((wf, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{wf.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{wf.total}</td>
                    <td className="px-6 py-4 text-sm text-green-600">{wf.success}</td>
                    <td className="px-6 py-4 text-sm text-red-600">{wf.failed}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${Math.round(wf.success_rate)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600">{Math.round(wf.success_rate)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page Performance Table */}
      {analytics?.page_analytics?.top_pages && analytics.page_analytics.top_pages.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Page Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Views</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submissions</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversion</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.page_analytics.top_pages.map((page) => (
                  <tr key={page.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link
                        to={`/pages/${page.id}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        {page.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{page.views.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{page.submissions.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{page.conversion_rate.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Performance Table */}
      {analytics?.form_analytics?.top_forms && analytics.form_analytics.top_forms.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Form Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Form</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submissions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.form_analytics.top_forms.map((form) => (
                  <tr key={form.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{form.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{form.page_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{form.submissions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <RecentActivity
        activities={analytics?.recent_activity || []}
      />
    </div>
  );
}
