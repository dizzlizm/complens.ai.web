import { useBillingSummary, useAdminPlans } from '@/lib/hooks/useAdmin';
import { CreditCard, TrendingUp, Users, DollarSign } from 'lucide-react';

export default function AdminBilling() {
  const { data, isLoading, error } = useBillingSummary();
  const { data: plans } = useAdminPlans();

  // Get dynamic prices from plan configs, with fallbacks
  const proPrice = plans?.find(p => p.plan_key === 'pro')?.price_monthly ?? 97;
  const businessPrice = plans?.find(p => p.plan_key === 'business')?.price_monthly ?? 297;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load billing summary</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-gray-400 mt-1">Platform revenue and subscription overview</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-gray-400 text-sm">Monthly Recurring Revenue</span>
          </div>
          <p className="text-3xl font-bold text-white">{data.mrr_formatted}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-gray-400 text-sm">Active Subscriptions</span>
          </div>
          <p className="text-3xl font-bold text-white">{data.active_subscriptions}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-gray-400 text-sm">Total Workspaces</span>
          </div>
          <p className="text-3xl font-bold text-white">{data.total_workspaces}</p>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-600/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-gray-400 text-sm">Conversion Rate</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {data.total_workspaces > 0
              ? `${((data.active_subscriptions / data.total_workspaces) * 100).toFixed(1)}%`
              : '0%'}
          </p>
        </div>
      </div>

      {/* Plan Breakdown */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Subscriptions by Plan</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Free */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400">Free</span>
              <span className="text-2xl font-bold text-white">{data.plan_counts.free}</span>
            </div>
            <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-400 rounded-full transition-all"
                style={{
                  width: `${data.total_workspaces > 0 ? (data.plan_counts.free / data.total_workspaces) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {data.total_workspaces > 0
                ? `${((data.plan_counts.free / data.total_workspaces) * 100).toFixed(1)}%`
                : '0%'} of workspaces
            </p>
          </div>

          {/* Pro */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-blue-400">Pro</span>
              <span className="text-2xl font-bold text-white">{data.plan_counts.pro}</span>
            </div>
            <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{
                  width: `${data.total_workspaces > 0 ? (data.plan_counts.pro / data.total_workspaces) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {data.total_workspaces > 0
                ? `${((data.plan_counts.pro / data.total_workspaces) * 100).toFixed(1)}%`
                : '0%'} of workspaces
            </p>
            <p className="text-xs text-blue-400 mt-1">
              ${data.plan_counts.pro * proPrice}/mo revenue
            </p>
          </div>

          {/* Business */}
          <div className="bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-purple-400">Business</span>
              <span className="text-2xl font-bold text-white">{data.plan_counts.business}</span>
            </div>
            <div className="h-2 bg-gray-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{
                  width: `${data.total_workspaces > 0 ? (data.plan_counts.business / data.total_workspaces) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {data.total_workspaces > 0
                ? `${((data.plan_counts.business / data.total_workspaces) * 100).toFixed(1)}%`
                : '0%'} of workspaces
            </p>
            <p className="text-xs text-purple-400 mt-1">
              ${data.plan_counts.business * businessPrice}/mo revenue
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
