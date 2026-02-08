import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Users, MessageSquare, CheckCircle, BarChart3 } from 'lucide-react';
import { useCurrentWorkspace } from '../lib/hooks';
import { useAnalytics } from '../lib/hooks/useAnalytics';
import StatCard from '../components/dashboard/StatCard';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';
import PageAnalytics from '../components/dashboard/PageAnalytics';
import FormAnalytics from '../components/dashboard/FormAnalytics';
import WelcomeCard from '../components/dashboard/WelcomeCard';
import RecentActivity from '../components/dashboard/RecentActivity';
import { LoadingSpinner } from '../components/ui';

const PERIODS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
] as const;

export default function Dashboard() {
  const [period, setPeriod] = useState('30d');
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: analytics, isLoading: isLoadingAnalytics } = useAnalytics(workspaceId, period);

  const isLoading = isLoadingWorkspace || isLoadingAnalytics;
  const summary = analytics?.summary;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-gray-500">Welcome back! Here's what's happening with your marketing.</p>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSpinner text="Loading analytics..." />}

      {/* Onboarding checklist for new users */}
      {!isLoading && summary && (
        <WelcomeCard
          hasPages={(summary.total_contacts ?? 0) > 0 || (analytics?.page_analytics?.total_page_views ?? 0) > 0}
          hasContacts={(summary.total_contacts ?? 0) > 0}
          hasWorkflows={(summary.total_workflows ?? 0) > 0}
        />
      )}

      {/* Stats grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Contacts"
            value={summary?.total_contacts?.toLocaleString() || '0'}
            icon={Users}
            trend={summary?.contact_trend}
            trendLabel="vs prev period"
          />
          <StatCard
            label="Active Workflows"
            value={summary?.active_workflows || 0}
            icon={GitBranch}
            trendLabel={`${summary?.total_workflows || 0} total`}
          />
          <StatCard
            label="Workflow Runs"
            value={summary?.total_runs?.toLocaleString() || '0'}
            icon={MessageSquare}
            trendLabel={`${summary?.success_rate || 0}% success rate`}
          />
          <StatCard
            label="Success Rate"
            value={`${summary?.success_rate || 0}%`}
            icon={CheckCircle}
            trendLabel={`${summary?.successful_runs || 0} successful`}
          />
        </div>
      )}

      {/* Charts */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Contact growth */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Growth</h2>
            <AnalyticsChart
              type="area"
              data={analytics.contact_growth}
              dataKeys={[
                { key: 'count', color: '#6366f1', name: 'New Contacts' },
              ]}
            />
          </div>

          {/* Workflow runs */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Workflow Runs</h2>
            <AnalyticsChart
              type="bar"
              data={analytics.workflow_runs}
              dataKeys={[
                { key: 'success', color: '#22c55e', name: 'Successful' },
                { key: 'failed', color: '#ef4444', name: 'Failed' },
              ]}
              stacked
            />
          </div>
        </div>
      )}

      {/* Page & Form Analytics */}
      {!isLoading && analytics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {analytics.page_analytics && (
            <PageAnalytics data={analytics.page_analytics} />
          )}
          {analytics.form_analytics && (
            <FormAnalytics data={analytics.form_analytics} />
          )}
        </div>
      )}

      {/* Top workflows + Recent activity */}
      {!isLoading && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Top performing workflows */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Workflows</h2>
            {analytics?.top_workflows && analytics.top_workflows.length > 0 ? (
              <div className="space-y-3">
                {analytics.top_workflows.map((wf, index) => (
                  <div key={wf.name} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-400 w-6">#{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{wf.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-green-500 h-full rounded-full"
                            style={{ width: `${wf.success_rate}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">{wf.success_rate}%</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{wf.total}</p>
                      <p className="text-xs text-gray-500">runs</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No workflow data yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Create a workflow to see performance stats
                </p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <RecentActivity
            activities={analytics?.recent_activity || []}
            isLoading={isLoadingAnalytics}
          />
        </div>
      )}

      {/* Quick actions */}
      {!isLoading && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              to="/workflows/new"
              className="flex items-center gap-3 p-3 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Workflow</p>
                <p className="text-sm text-gray-500">Build automation</p>
              </div>
            </Link>
            <Link
              to="/contacts"
              className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Manage Contacts</p>
                <p className="text-sm text-gray-500">View and add</p>
              </div>
            </Link>
            <Link
              to="/pages"
              className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Landing Pages</p>
                <p className="text-sm text-gray-500">Create and edit</p>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
