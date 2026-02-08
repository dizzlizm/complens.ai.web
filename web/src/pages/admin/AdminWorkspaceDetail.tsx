import { useParams, Link } from 'react-router-dom';
import { useAdminWorkspace, useUpdateAdminWorkspace, useWorkspaceStats } from '@/lib/hooks/useAdmin';
import {
  ArrowLeft,
  Building2,
  User,
  Save,
  MessageSquare,
  Phone,
  Mail,
  FileText,
  Users,
  Workflow,
  FormInput,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
} from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';

export default function AdminWorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdminWorkspace(id);
  const { data: stats, isLoading: statsLoading } = useWorkspaceStats(id);
  const updateWorkspace = useUpdateAdminWorkspace(id || '');
  const { showToast } = useToast();

  const [editPlan, setEditPlan] = useState<string | null>(null);

  const handleSavePlan = async () => {
    if (!editPlan) return;

    try {
      await updateWorkspace.mutateAsync({ plan: editPlan });
      showToast('success', 'Workspace plan updated');
      setEditPlan(null);
    } catch {
      showToast('error', 'Failed to update plan');
    }
  };

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
        <p className="text-red-400">Failed to load workspace</p>
        <Link to="/admin/workspaces" className="text-red-400 hover:text-red-300 mt-4 inline-block">
          Back to workspaces
        </Link>
      </div>
    );
  }

  const { workspace, owner } = data;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to="/admin/workspaces"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workspaces
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gray-700 rounded-xl flex items-center justify-center">
            <Building2 className="w-7 h-7 text-gray-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{workspace.name}</h1>
            <p className="text-gray-500 font-mono text-sm">{workspace.id}</p>
          </div>
        </div>
      </div>

      {/* Integration Status & Subscription Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Integration Status */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Twilio SMS</span>
          </div>
          <div className="flex items-center gap-2">
            {workspace.has_twilio ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-medium">Configured</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-500" />
                <span className="text-gray-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">SendGrid Email</span>
          </div>
          <div className="flex items-center gap-2">
            {workspace.has_sendgrid ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-medium">Configured</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-gray-500" />
                <span className="text-gray-500">Not configured</span>
              </>
            )}
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Trial Ends</span>
          </div>
          <p className="text-white font-medium">
            {workspace.trial_ends_at
              ? new Date(workspace.trial_ends_at).toLocaleDateString()
              : '-'}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Billing Period End</span>
          </div>
          <p className="text-white font-medium">
            {workspace.plan_period_end
              ? new Date(workspace.plan_period_end).toLocaleDateString()
              : '-'}
          </p>
        </div>
      </div>

      {/* Content Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Contacts</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.contacts ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Pages</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.pages ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Workflow className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-400">Workflows</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.workflows ?? 0}
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FormInput className="w-4 h-4 text-orange-400" />
            <span className="text-sm text-gray-400">Forms</span>
          </div>
          <p className="text-2xl font-bold text-white">
            {statsLoading ? '...' : stats?.forms ?? 0}
          </p>
        </div>
      </div>

      {/* Workflow Runs Stats */}
      {stats?.workflow_runs && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Workflow Runs
          </h3>
          <div className="flex gap-6">
            <div>
              <span className="text-gray-400 text-sm">Total</span>
              <p className="text-xl font-bold text-white">{stats.workflow_runs.total}</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Succeeded</span>
              <p className="text-xl font-bold text-green-400">{stats.workflow_runs.succeeded}</p>
            </div>
            <div>
              <span className="text-gray-400 text-sm">Failed</span>
              <p className="text-xl font-bold text-red-400">{stats.workflow_runs.failed}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workspace Details */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            Workspace Details
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">Name</label>
              <p className="text-white">{workspace.name}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Status</label>
              <p className={workspace.is_active ? 'text-green-400' : 'text-red-400'}>
                {workspace.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Plan</label>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={editPlan ?? workspace.plan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
                {editPlan && editPlan !== workspace.plan && (
                  <button
                    onClick={handleSavePlan}
                    disabled={updateWorkspace.isPending}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400">Subscription Status</label>
              <p className="text-white">{workspace.subscription_status || 'None'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Stripe Customer</label>
              <p className="text-white font-mono text-sm">
                {workspace.stripe_customer_id || '-'}
              </p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Notification Email</label>
              <p className="text-white">{workspace.notification_email || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Twilio Phone</label>
              <p className="text-white">{workspace.twilio_phone || '-'}</p>
            </div>

            <div>
              <label className="text-sm text-gray-400">Created</label>
              <p className="text-white">
                {workspace.created_at
                  ? new Date(workspace.created_at).toLocaleString()
                  : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Owner Details */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            Owner
          </h2>

          {owner ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400">Email</label>
                <p className="text-white">{owner.email}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Name</label>
                <p className="text-white">{owner.name || '-'}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Status</label>
                <p className="text-white">{owner.status}</p>
              </div>

              <div>
                <label className="text-sm text-gray-400">Enabled</label>
                <p className={owner.enabled ? 'text-green-400' : 'text-red-400'}>
                  {owner.enabled ? 'Yes' : 'No'}
                </p>
              </div>

              <div>
                <label className="text-sm text-gray-400">User ID</label>
                <p className="text-gray-500 font-mono text-sm">{owner.id}</p>
              </div>

              <Link
                to={`/admin/users/${owner.id}`}
                className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 mt-4"
              >
                View User Details
              </Link>
            </div>
          ) : (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">Owner not found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
