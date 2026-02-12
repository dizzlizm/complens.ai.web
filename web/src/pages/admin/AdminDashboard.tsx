import { Link } from 'react-router-dom';
import { usePlatformStats, useBillingSummary, useSystemHealth } from '@/lib/hooks/useAdmin';
import {
  Building2,
  Users,
  FileText,
  GitBranch,
  CreditCard,
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
  DollarSign,
  FormInput,
} from 'lucide-react';

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: billing, isLoading: billingLoading } = useBillingSummary();
  const { data: health } = useSystemHealth();

  const healthColor = {
    healthy: 'text-green-400',
    degraded: 'text-yellow-400',
    unhealthy: 'text-red-400',
  };
  const HealthIcon = {
    healthy: CheckCircle,
    degraded: AlertTriangle,
    unhealthy: XCircle,
  };
  const HealthComp = health ? HealthIcon[health.status] : Activity;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Platform overview at a glance</p>
      </div>

      {/* System Health Banner */}
      {health && health.status !== 'healthy' && (
        <div className={`mb-6 p-4 rounded-lg border ${
          health.status === 'degraded'
            ? 'bg-yellow-600/10 border-yellow-600/30'
            : 'bg-red-600/10 border-red-600/30'
        }`}>
          <div className="flex items-center gap-2">
            <HealthComp className={`w-5 h-5 ${healthColor[health.status]}`} />
            <span className={`font-medium ${healthColor[health.status]}`}>
              System {health.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Check the <Link to="/admin/system" className="text-red-400 hover:text-red-300 underline">System page</Link> for details.
          </p>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Workspaces"
          value={stats?.total_workspaces}
          loading={statsLoading}
          icon={Building2}
          color="text-blue-400"
          href="/admin/workspaces"
        />
        <MetricCard
          label="Total Contacts"
          value={stats?.total_contacts}
          loading={statsLoading}
          icon={Users}
          color="text-green-400"
        />
        <MetricCard
          label="Total Pages"
          value={stats?.total_pages}
          loading={statsLoading}
          icon={FileText}
          color="text-purple-400"
        />
        <MetricCard
          label="Total Workflows"
          value={stats?.total_workflows}
          loading={statsLoading}
          icon={GitBranch}
          color="text-orange-400"
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Forms"
          value={stats?.total_forms}
          loading={statsLoading}
          icon={FormInput}
          color="text-cyan-400"
        />
        <MetricCard
          label="Twilio Enabled"
          value={stats?.workspaces_with_twilio}
          loading={statsLoading}
          icon={Activity}
          color="text-indigo-400"
        />
        <MetricCard
          label="SendGrid Enabled"
          value={stats?.workspaces_with_sendgrid}
          loading={statsLoading}
          icon={Activity}
          color="text-teal-400"
        />
        <MetricCard
          label="System Health"
          value={health ? health.status.charAt(0).toUpperCase() + health.status.slice(1) : undefined}
          loading={!health}
          icon={HealthComp}
          color={health ? healthColor[health.status] : 'text-gray-400'}
          href="/admin/system"
        />
      </div>

      {/* Billing Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-red-400" />
              Billing Summary
            </h2>
            <Link to="/admin/billing" className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              View Details <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {billingLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-10 bg-gray-700 rounded w-1/3" />
              <div className="h-4 bg-gray-700 rounded w-2/3" />
            </div>
          ) : billing ? (
            <div>
              <p className="text-3xl font-bold text-white">{billing.mrr_formatted}</p>
              <p className="text-sm text-gray-400 mt-1">Monthly Recurring Revenue</p>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-700">
                <div>
                  <p className="text-sm text-gray-400">Active Subs</p>
                  <p className="text-lg font-semibold text-white">{billing.active_subscriptions}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Pro</p>
                  <p className="text-lg font-semibold text-blue-400">{billing.plan_counts.pro}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Business</p>
                  <p className="text-lg font-semibold text-purple-400">{billing.plan_counts.business}</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No billing data available</p>
          )}
        </div>

        {/* Queue Health */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Queue Health
            </h2>
            <Link to="/admin/system" className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1">
              View Details <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {!health ? (
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-gray-700 rounded w-1/2" />
              <div className="h-6 bg-gray-700 rounded w-2/3" />
            </div>
          ) : Object.keys(health.queues).length === 0 ? (
            <p className="text-gray-500">No queues configured</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(health.queues).map(([name, queue]) => (
                <div key={name} className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-lg">
                  <span className="text-sm text-gray-300">{name}</span>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-400">{queue.messages} msgs</span>
                    {queue.in_flight > 0 && (
                      <span className="text-blue-400">{queue.in_flight} in-flight</span>
                    )}
                    {queue.delayed > 0 && (
                      <span className="text-yellow-400">{queue.delayed} delayed</span>
                    )}
                    {queue.error && (
                      <span className="text-red-400">Error</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickLink href="/admin/workspaces" icon={Building2} label="Manage Workspaces" />
          <QuickLink href="/admin/users" icon={Users} label="Manage Users" />
          <QuickLink href="/admin/costs" icon={DollarSign} label="View AWS Costs" />
          <QuickLink href="/admin/plans" icon={CreditCard} label="Edit Plans" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  value: number | string | undefined;
  loading: boolean;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href?: string;
}) {
  const card = (
    <div className={`bg-gray-800 rounded-lg p-4 border border-gray-700 ${href ? 'hover:border-gray-600 transition-colors' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className="text-gray-400 text-sm">{label}</p>
      </div>
      {loading ? (
        <div className="h-8 w-16 bg-gray-700 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-white">
          {typeof value === 'number' ? value.toLocaleString() : value ?? '-'}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link to={href}>{card}</Link>;
  }
  return card;
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-2 p-3 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-gray-300 hover:text-white transition-colors"
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </Link>
  );
}
