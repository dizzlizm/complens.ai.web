import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Users, MessageSquare, CheckCircle, DollarSign, TrendingUp, Trophy } from 'lucide-react';
import { useCurrentWorkspace, usePartners } from '../lib/hooks';
import { useAnalytics } from '../lib/hooks/useAnalytics';
import { useBusinessProfile } from '../lib/hooks/useAI';
import StatCard from '../components/dashboard/StatCard';
import AnalyticsChart from '../components/dashboard/AnalyticsChart';
import PageAnalytics from '../components/dashboard/PageAnalytics';
import FormAnalytics from '../components/dashboard/FormAnalytics';
import WelcomeCard from '../components/dashboard/WelcomeCard';
import RecentActivity from '../components/dashboard/RecentActivity';
import OnboardingWizard from '../components/onboarding/OnboardingWizard';
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
  const { data: profile, isLoading: isLoadingProfile } = useBusinessProfile(workspaceId);
  const { data: partnersData } = usePartners(workspaceId || '');
  const [wizardDismissed, setWizardDismissed] = useState(
    () => localStorage.getItem('onboarding_dismissed') === 'true'
  );

  const isLoading = isLoadingWorkspace || isLoadingAnalytics;
  const summary = analytics?.summary;

  // Show onboarding wizard for new users
  const showWizard = !isLoadingProfile && !profile?.onboarding_completed && !wizardDismissed;

  if (showWizard) {
    return (
      <OnboardingWizard
        onComplete={() => setWizardDismissed(true)}
      />
    );
  }

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

      {/* Charts - only show when there's data */}
      {!isLoading && analytics && (analytics.contact_growth?.length > 0 || analytics.workflow_runs?.length > 0) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {analytics.contact_growth?.length > 0 && (
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
          )}
          {analytics.workflow_runs?.length > 0 && (
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
          )}
        </div>
      )}

      {/* Partner Pipeline Summary - only show when there are partners */}
      {!isLoading && partnersData && partnersData.summary.total_partners > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Partner Pipeline</h2>
            <Link to="/partners" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View Pipeline
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-blue-600 font-medium">Pipeline Value</p>
                <p className="text-lg font-bold text-gray-900">${partnersData.summary.total_value.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-indigo-600 font-medium">Active Partners</p>
                <p className="text-lg font-bold text-gray-900">
                  {partnersData.partners.filter(p => p.stage !== 'Active' && p.stage !== 'Inactive').length}
                </p>
              </div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-green-600 font-medium">Active</p>
                <p className="text-lg font-bold text-gray-900">
                  {partnersData.summary.by_stage['Active']?.count || 0}
                  {(partnersData.summary.by_stage['Active']?.value ?? 0) > 0 && (
                    <span className="text-sm font-normal text-gray-500 ml-1">
                      (${(partnersData.summary.by_stage['Active']?.value || 0).toLocaleString()})
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
          {/* Stage breakdown */}
          <div className="space-y-2">
            {partnersData.stages
              .filter(stage => (partnersData.summary.by_stage[stage]?.count || 0) > 0)
              .map(stage => {
                const stageData = partnersData.summary.by_stage[stage];
                const pct = partnersData.summary.total_partners > 0
                  ? Math.round((stageData.count / partnersData.summary.total_partners) * 100)
                  : 0;
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-28 truncate">{stage}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          stage === 'Active' ? 'bg-green-500' : stage === 'Inactive' ? 'bg-gray-400' : 'bg-primary-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">
                      {stageData.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Page & Form Analytics - only show when there's data */}
      {!isLoading && analytics && (
        ((analytics.page_analytics?.total_page_views ?? 0) > 0 || (analytics.form_analytics?.total_submissions ?? 0) > 0) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {analytics.page_analytics && analytics.page_analytics.total_page_views > 0 && (
              <PageAnalytics data={analytics.page_analytics} />
            )}
            {analytics.form_analytics && analytics.form_analytics.total_submissions > 0 && (
              <FormAnalytics data={analytics.form_analytics} />
            )}
          </div>
        )
      )}

      {/* Top workflows + Recent activity - only show when there's data */}
      {!isLoading && (
        ((analytics?.top_workflows?.length ?? 0) > 0 || (analytics?.recent_activity?.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {analytics?.top_workflows && analytics.top_workflows.length > 0 && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Workflows</h2>
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
              </div>
            )}
            {analytics?.recent_activity && analytics.recent_activity.length > 0 && (
              <RecentActivity
                activities={analytics.recent_activity}
                isLoading={isLoadingAnalytics}
              />
            )}
          </div>
        )
      )}

      {/* Quick actions */}
      {!isLoading && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              to="/partners"
              className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Partner Pipeline</p>
                <p className="text-sm text-gray-500">Manage partners</p>
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
