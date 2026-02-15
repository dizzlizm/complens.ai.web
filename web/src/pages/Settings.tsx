import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  Bell, Shield, CreditCard, Users, Building, Globe, Zap, Loader2, Check, AlertCircle,
  ExternalLink, Mail, Monitor, LogOut, Plus, ChevronRight,
  MessageSquare, BarChart3, FileText,
  Trash2, TrendingUp, X, Copy, Clock, RefreshCw
} from 'lucide-react';
import { useCurrentWorkspace, useUpdateWorkspace, useStripeConnectStatus, useStartStripeConnect, useDisconnectStripe, useCheckDomainAuth, useSetupDomain, useListDomains, useDeleteSavedDomain, useVerifiedEmails, useAddVerifiedEmail, useRemoveVerifiedEmail } from '../lib/hooks';
import type { DomainSetupResult, DnsRecord } from '../lib/hooks/useEmailWarmup';
import { useBillingStatus, useCreateCheckout, useCreatePortal } from '../lib/hooks/useBilling';
import { getApiErrorMessage } from '../lib/api';
import TwilioConfigCard from '../components/settings/TwilioConfigCard';
import SegmentConfigCard from '../components/settings/SegmentConfigCard';
import TeamManagement from '../components/settings/TeamManagement';
import PricingTable from '../components/settings/PricingTable';
import { TimezoneSelect } from '../components/ui';
import WarmupManager from '../components/email/WarmupManager';

const settingsSections = [
  {
    id: 'workspace',
    name: 'Workspace',
    icon: Building,
    description: 'Manage your workspace settings and preferences',
  },
  {
    id: 'team',
    name: 'Team',
    icon: Users,
    description: 'Invite team members and manage roles',
  },
  {
    id: 'billing',
    name: 'Billing',
    icon: CreditCard,
    description: 'Manage subscription and payment methods',
  },
  {
    id: 'integrations',
    name: 'Integrations',
    icon: Zap,
    description: 'Connect third-party services and APIs',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    icon: Bell,
    description: 'Configure how you receive notifications',
  },
  {
    id: 'security',
    name: 'Security',
    icon: Shield,
    description: 'Authentication, SSO, and access control',
  },
  {
    id: 'domains',
    name: 'Email Infrastructure',
    icon: Mail,
    description: 'Verify sending domains, DNS records, and email warmup',
  },
];

export default function Settings() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const initialSection = sectionParam === 'domains' || sectionParam === 'email' ? 'domains' : 'workspace';
  const [activeSection, setActiveSection] = useState(initialSection);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">
          Manage your workspace settings and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Settings navigation */}
        <nav className="lg:w-64 flex-shrink-0">
          <ul className="space-y-1">
            {settingsSections.map((section) => (
              <li key={section.id}>
                <button
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <section.icon className="w-5 h-5" />
                  <span className="font-medium">{section.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Settings content */}
        <div className="flex-1 min-w-0">
          {activeSection === 'workspace' && <WorkspaceSettings />}
          {activeSection === 'team' && <TeamSettings />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'integrations' && <IntegrationSettings />}
          {activeSection === 'billing' && <BillingSettings />}
          {activeSection === 'security' && <SecuritySettings />}
          {activeSection === 'domains' && <DomainsSettings />}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSettings() {
  const { workspace, workspaceId, isLoading } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');

  const [name, setName] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setNotificationEmail(workspace.notification_email || '');
      setTimezone(workspace.settings?.timezone || 'America/New_York');
    }
  }, [workspace]);

  const handleSave = async () => {
    if (!workspaceId) return;

    setSaveStatus('saving');
    try {
      await updateWorkspace.mutateAsync({
        name,
        notification_email: notificationEmail || undefined,
        settings: { ...workspace?.settings, timezone },
      });
      setSaveStatus('saved');
      setHasChanges(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
    }
  };

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">General</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHasChanges(true);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workspace ID
            </label>
            <input
              type="text"
              className="input bg-gray-50 font-mono text-sm"
              value={workspaceId || ''}
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Used for API integrations</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            <TimezoneSelect
              value={timezone}
              onChange={(value) => {
                setTimezone(value);
                setHasChanges(true);
              }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notification Email
            </label>
            <input
              type="email"
              className="input"
              placeholder="alerts@yourcompany.com"
              value={notificationEmail}
              onChange={(e) => {
                setNotificationEmail(e.target.value);
                setHasChanges(true);
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              Receive workflow notifications and form submissions here
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges || saveStatus === 'saving'}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
          {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
        </button>
        {saveStatus === 'saved' && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <Check className="w-4 h-4" /> Saved
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-red-600">Failed to save</span>
        )}
      </div>
    </div>
  );
}

function TeamSettings() {
  const { workspaceId } = useCurrentWorkspace();
  return <TeamManagement workspaceId={workspaceId || ''} />;
}

function NotificationSettings() {
  const { workspace, workspaceId } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');
  const [settings, setSettings] = useState({
    email_form_submissions: true,
    email_workflow_errors: true,
    email_weekly_digest: false,
    email_new_contacts: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (workspace?.settings?.notifications) {
      setSettings({ ...settings, ...workspace.settings.notifications });
    }
  }, [workspace]);

  const handleToggle = async (key: string) => {
    const newSettings = { ...settings, [key]: !settings[key as keyof typeof settings] };
    setSettings(newSettings);

    setSaving(true);
    try {
      await updateWorkspace.mutateAsync({
        settings: {
          ...workspace?.settings,
          notifications: newSettings
        },
      });
    } catch (error) {
      // Revert on error
      setSettings(settings);
    }
    setSaving(false);
  };

  const notificationOptions = [
    {
      key: 'email_form_submissions',
      label: 'Form Submissions',
      description: 'Get notified when someone submits a form on your pages',
      icon: FileText,
    },
    {
      key: 'email_workflow_errors',
      label: 'Workflow Errors',
      description: 'Alert when a workflow fails or encounters an error',
      icon: AlertCircle,
    },
    {
      key: 'email_new_contacts',
      label: 'New Contacts',
      description: 'Notification when a new contact is added',
      icon: Users,
    },
    {
      key: 'email_weekly_digest',
      label: 'Weekly Digest',
      description: 'Summary of your workspace activity each week',
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email Notifications</h2>
            <p className="text-sm text-gray-500">Choose what you want to be notified about</p>
          </div>
          {saving && <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />}
        </div>
        <div className="space-y-1">
          {notificationOptions.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(item.key)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings[item.key as keyof typeof settings] ? 'bg-primary-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings[item.key as keyof typeof settings] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// Available integrations (only ones that actually work)
const integrationCategories = [
  {
    id: 'payments',
    name: 'Payments',
    icon: CreditCard,
    integrations: [
      { id: 'stripe', name: 'Stripe', description: 'Accept payments and subscriptions', component: 'stripe' },
    ],
  },
  {
    id: 'communication',
    name: 'Communication',
    icon: MessageSquare,
    integrations: [
      { id: 'twilio', name: 'Twilio', description: 'SMS and voice messaging', component: 'twilio' },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics & Data',
    icon: BarChart3,
    integrations: [
      { id: 'segment', name: 'Segment', description: 'Customer data platform', component: 'segment' },
    ],
  },
];

function IntegrationSettings() {
  const { workspaceId } = useCurrentWorkspace();
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900">Integrations</h2>
        <p className="text-sm text-gray-500 mt-1">
          Connect third-party services to your workspace
        </p>
      </div>

      {integrationCategories.map(category => (
        <div key={category.id} className="card">
          <div className="flex items-center gap-2 mb-4">
            <category.icon className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">{category.name}</h3>
          </div>
          <div className="space-y-3">
            {category.integrations.map(integration => {
              const isExpanded = expandedIntegration === integration.id;

              return (
                <div key={integration.id}>
                  <button
                    onClick={() => setExpandedIntegration(isExpanded ? null : integration.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all text-left
                      border-gray-200 hover:border-primary-300 hover:bg-primary-50/50 cursor-pointer
                      ${isExpanded ? 'border-primary-300 bg-primary-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary-100">
                        <Zap className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{integration.name}</p>
                        <p className="text-sm text-gray-500">{integration.description}</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>

                  {isExpanded && integration.component && (
                    <div className="mt-3 ml-4 pl-4 border-l-2 border-primary-200">
                      {integration.component === 'stripe' && (
                        <StripeIntegrationCard workspaceId={workspaceId || ''} />
                      )}
                      {integration.component === 'twilio' && (
                        <TwilioConfigCard workspaceId={workspaceId || ''} />
                      )}
                      {integration.component === 'segment' && (
                        <SegmentConfigCard workspaceId={workspaceId || ''} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StripeIntegrationCard({ workspaceId }: { workspaceId: string }) {
  const { data: stripeStatus, isLoading } = useStripeConnectStatus(workspaceId || undefined);
  const startConnect = useStartStripeConnect();
  const disconnectStripe = useDisconnectStripe();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const handleConnect = async () => {
    if (!workspaceId) return;
    try {
      const result = await startConnect.mutateAsync({
        workspaceId,
        redirectUri: `${window.location.origin}/settings?stripe_callback=1`,
      });
      window.location.href = result.oauth_url;
    } catch {
      // Error handled by mutation state
    }
  };

  const handleDisconnect = async () => {
    if (!workspaceId) return;
    try {
      await disconnectStripe.mutateAsync({ workspaceId });
      setShowDisconnectConfirm(false);
    } catch {
      // Error handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const isConnected = stripeStatus?.connected;
  const account = stripeStatus?.account;

  if (isConnected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-green-600">
          <Check className="w-5 h-5" />
          <span className="font-medium">Connected</span>
        </div>
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Account</p>
              <p className="font-medium">{account?.email || 'Connected'}</p>
            </div>
            <div>
              <p className="text-gray-500">Mode</p>
              <p className="font-medium">{stripeStatus?.livemode ? 'Live' : 'Test'}</p>
            </div>
          </div>
        </div>
        {!account?.details_submitted && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
            <p className="text-yellow-800">Complete your Stripe setup to start accepting payments.</p>
            <a
              href="https://dashboard.stripe.com/connect/accounts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-yellow-700 font-medium mt-1 hover:underline"
            >
              Complete setup <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500 font-mono">{stripeStatus?.stripe_account_id}</p>
          {showDisconnectConfirm ? (
            <div className="flex items-center gap-2">
              <button onClick={handleDisconnect} disabled={disconnectStripe.isPending} className="btn btn-sm bg-red-600 text-white hover:bg-red-700">
                {disconnectStripe.isPending ? 'Disconnecting...' : 'Confirm'}
              </button>
              <button onClick={() => setShowDisconnectConfirm(false)} className="btn btn-sm btn-secondary">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowDisconnectConfirm(true)} className="text-sm text-red-600 hover:text-red-700">Disconnect</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm text-gray-600">
        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" /> Accept one-time and recurring payments</li>
        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" /> Trigger workflows on payment events</li>
        <li className="flex items-center gap-2"><Check className="w-4 h-4 text-green-600" /> Automatic 2% platform fee</li>
      </ul>
      <button onClick={handleConnect} disabled={startConnect.isPending || !workspaceId} className="btn btn-primary w-full">
        {startConnect.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Connect Stripe
      </button>
    </div>
  );
}

function BillingSettings() {
  const { workspaceId } = useCurrentWorkspace();
  const { data: billing, isLoading } = useBillingStatus(workspaceId || undefined);
  const createCheckout = useCreateCheckout(workspaceId || '');
  const createPortal = useCreatePortal(workspaceId || '');
  const [loadingPlan, setLoadingPlan] = useState('');

  const currentPlan = billing?.plan || 'free';
  const isPaid = currentPlan !== 'free';

  const handleSelectPlan = async (priceId: string) => {
    setLoadingPlan(priceId);
    try {
      const result = await createCheckout.mutateAsync({ price_id: priceId });
      window.location.href = result.url;
    } catch (err) {
      setLoadingPlan('');
    }
  };

  const handleManageBilling = async () => {
    try {
      const result = await createPortal.mutateAsync();
      window.location.href = result.url;
    } catch {
      // Error handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  const planColors = {
    free: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-700' },
    pro: { bg: 'bg-primary-50', border: 'border-primary-200', badge: 'bg-primary-100 text-primary-700' },
    business: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700' },
  };
  const colors = planColors[currentPlan as keyof typeof planColors] || planColors.free;

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-6`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${isPaid ? 'bg-gradient-to-br from-primary-500 to-violet-500' : 'bg-gray-200'} flex items-center justify-center`}>
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-gray-900 capitalize">{currentPlan} Plan</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                  {billing?.subscription_status === 'active' ? 'Active' : billing?.subscription_status === 'past_due' ? 'Past Due' : 'Free Tier'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">
                {isPaid ? 'Thank you for being a subscriber!' : 'Upgrade to unlock more features'}
              </p>
            </div>
          </div>

          {billing?.has_stripe_customer && (
            <button
              onClick={handleManageBilling}
              disabled={createPortal.isPending}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              {createPortal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Manage Subscription
            </button>
          )}
        </div>
      </div>

      {billing?.usage && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resource Usage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(billing.usage).map(([key, value]) => {
              if ('enabled' in value) return null;
              const usage = value as { current: number; limit: number | string; percentage: number };
              const isUnlimited = usage.limit === 'unlimited' || usage.limit === -1;
              return (
                <div key={key} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {usage.current.toLocaleString()} <span className="text-gray-400 font-normal">/ {isUnlimited ? '∞' : usage.limit.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isUnlimited ? 'bg-primary-400' : usage.percentage > 90 ? 'bg-red-500' : usage.percentage > 70 ? 'bg-amber-500' : 'bg-primary-500'}`}
                      style={{ width: isUnlimited ? '15%' : `${Math.min(usage.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Choose Your Plan</h2>
          <p className="text-gray-600 mt-2">Scale your marketing automation as you grow</p>
        </div>
        <PricingTable currentPlan={currentPlan} onSelectPlan={handleSelectPlan} isLoading={!!loadingPlan} loadingPlan={loadingPlan} />
      </div>
    </div>
  );
}

function SecuritySettings() {
  const { changePassword, globalSignOut } = useAuth();
  const navigate = useNavigate();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [passwordError, setPasswordError] = useState('');

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutStatus, setSignOutStatus] = useState<'idle' | 'signing-out'>('idle');

  const handleChangePassword = useCallback(async () => {
    setPasswordError('');

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordStatus('saving');
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordStatus('saved');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPasswordStatus('idle');
        setShowPasswordForm(false);
      }, 2000);
    } catch (err: unknown) {
      setPasswordStatus('error');
      if (err instanceof Error) {
        if (err.name === 'NotAuthorizedException') {
          setPasswordError('Current password is incorrect');
        } else if (err.name === 'InvalidPasswordException') {
          setPasswordError('New password does not meet requirements. Use a mix of uppercase, lowercase, numbers, and symbols.');
        } else if (err.name === 'LimitExceededException') {
          setPasswordError('Too many attempts. Please try again later.');
        } else {
          setPasswordError(err.message || 'Failed to change password');
        }
      } else {
        setPasswordError('Failed to change password');
      }
    }
  }, [changePassword, currentPassword, newPassword, confirmPassword]);

  const handleGlobalSignOut = useCallback(async () => {
    setSignOutStatus('signing-out');
    try {
      await globalSignOut();
      navigate('/login');
    } catch {
      setSignOutStatus('idle');
      setShowSignOutConfirm(false);
    }
  }, [globalSignOut, navigate]);

  return (
    <div className="space-y-6">
      {/* Password */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Password</h2>
        <p className="text-sm text-gray-500 mb-4">Change your password to keep your account secure</p>

        {!showPasswordForm ? (
          <button
            className="btn btn-secondary"
            onClick={() => setShowPasswordForm(true)}
          >
            Change Password
          </button>
        ) : (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {passwordError && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {passwordError}
              </div>
            )}

            {passwordStatus === 'saved' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="w-4 h-4" />
                Password changed successfully
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                className="btn btn-primary"
                onClick={handleChangePassword}
                disabled={passwordStatus === 'saving' || !currentPassword || !newPassword || !confirmPassword}
              >
                {passwordStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  'Update Password'
                )}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                  setPasswordStatus('idle');
                }}
                disabled={passwordStatus === 'saving'}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Two-Factor Authentication */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-4">Add an extra layer of security to your account</p>
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Email Verification</p>
              <p className="text-sm text-gray-500">Email verification is required for all accounts</p>
            </div>
          </div>
          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
            <Check className="w-3 h-3" /> Active
          </span>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <Monitor className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Current Session</p>
                <p className="text-sm text-gray-500">This device · Active now</p>
              </div>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Current</span>
          </div>
        </div>

        {!showSignOutConfirm ? (
          <button
            className="mt-4 text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            onClick={() => setShowSignOutConfirm(true)}
          >
            <LogOut className="w-4 h-4" />
            Sign out of all other sessions
          </button>
        ) : (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 mb-3">
              This will sign you out on all devices including this one. You will need to log in again.
            </p>
            <div className="flex items-center gap-3">
              <button
                className="btn bg-red-600 text-white hover:bg-red-700 text-sm px-3 py-1.5"
                onClick={handleGlobalSignOut}
                disabled={signOutStatus === 'signing-out'}
              >
                {signOutStatus === 'signing-out' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  'Yes, sign out everywhere'
                )}
              </button>
              <button
                className="btn btn-secondary text-sm px-3 py-1.5"
                onClick={() => setShowSignOutConfirm(false)}
                disabled={signOutStatus === 'signing-out'}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DomainsSettings() {
  const { workspaceId } = useCurrentWorkspace();
  const [subTab, setSubTab] = useState<'domains' | 'emails' | 'warmup'>('domains');

  const subTabs = [
    { id: 'domains' as const, label: 'Sending Domains' },
    { id: 'emails' as const, label: 'Verified Emails' },
    { id: 'warmup' as const, label: 'Warmup' },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="flex border-b border-gray-200">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'domains' && (
        <SendingDomainsCard workspaceId={workspaceId} onNavigateToWarmup={() => setSubTab('warmup')} />
      )}
      {subTab === 'emails' && (
        <VerifiedEmailsCard workspaceId={workspaceId} />
      )}
      {subTab === 'warmup' && (
        <WarmupManager workspaceId={workspaceId} onNavigateToDomains={() => setSubTab('domains')} />
      )}
    </div>
  );
}

function VerifiedEmailsCard({ workspaceId }: { workspaceId: string | undefined }) {
  const { data: verifiedData, isLoading, refetch } = useVerifiedEmails(workspaceId);
  const addEmail = useAddVerifiedEmail(workspaceId || '');
  const removeEmail = useRemoveVerifiedEmail(workspaceId || '');

  const [showAddForm, setShowAddForm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const emails = verifiedData?.items || [];
  const hasPending = emails.some(e => !e.verified);

  // Auto-poll when there are pending emails (same pattern as warmup reply-to)
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(() => { refetch(); }, 4000);
    return () => clearInterval(interval);
  }, [hasPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    try {
      await addEmail.mutateAsync({ email });
      setPendingEmail(email);
      setEmailInput('');
    } catch {
      // Error handled by mutation state
    }
  };

  const handleRemove = async (email: string) => {
    if (confirmRemove !== email) {
      setConfirmRemove(email);
      return;
    }
    try {
      await removeEmail.mutateAsync({ email });
      setConfirmRemove(null);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Verified Emails</h2>
          <p className="text-sm text-gray-500">
            Register and verify email addresses for sending. Only verified emails can be used as From or Reply-To addresses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-sm inline-flex items-center gap-1"
            title="Re-check verification status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary btn-sm inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add Email
            </button>
          )}
        </div>
      </div>

      {/* Add email form */}
      {showAddForm && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
          <div className="flex gap-2">
            <input
              type="email"
              className="input flex-1"
              placeholder="hello@yourcompany.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!emailInput.trim() || !emailInput.includes('@') || addEmail.isPending}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {addEmail.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Verification
            </button>
            <button onClick={() => { setShowAddForm(false); setEmailInput(''); setPendingEmail(null); }} className="btn btn-secondary">
              Cancel
            </button>
          </div>
          {addEmail.isError && (
            <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {getApiErrorMessage(addEmail.error, 'Failed to send verification')}
            </p>
          )}
          {pendingEmail && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                Verification email sent to <strong>{pendingEmail}</strong>. Click the link in your inbox — this will update automatically.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Email list */}
      {isLoading && (
        <div className="flex items-center justify-center py-6 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading emails...
        </div>
      )}

      {!isLoading && emails.length > 0 && (
        <div className="mt-4 space-y-2">
          {emails.map((item) => (
            <div
              key={item.email}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">{item.email}</span>
                {item.verified ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium inline-flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Verified
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Waiting...
                  </span>
                )}
              </div>
              <button
                onClick={() => handleRemove(item.email)}
                disabled={removeEmail.isPending}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  confirmRemove === item.email
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                {confirmRemove === item.email ? 'Click again to confirm' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && emails.length === 0 && !showAddForm && (
        <div className="mt-4 p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <Mail className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No emails registered</p>
          <p className="text-sm text-gray-500 mt-1">
            Add an email address to verify it for sending
          </p>
        </div>
      )}
    </div>
  );
}

function SendingDomainsCard({ workspaceId, onNavigateToWarmup }: { workspaceId: string | undefined; onNavigateToWarmup?: () => void }) {
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [domainInput, setDomainInput] = useState('');
  const [setupResult, setSetupResult] = useState<DomainSetupResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null);

  const { data: savedDomainsData, isLoading: isLoadingDomains } = useListDomains(workspaceId);
  const setupDomain = useSetupDomain(workspaceId || '');
  const deleteDomain = useDeleteSavedDomain(workspaceId || '');

  const savedDomains = savedDomainsData?.items || [];

  // Poll auth status while wizard is open and we have a setup result
  const { data: authStatus, isLoading: isCheckingAuth } = useCheckDomainAuth(
    workspaceId,
    setupResult ? setupResult.domain : undefined,
  );

  // Auto-poll every 30s while DNS panel is open
  const pollAuth = useCheckDomainAuth(
    workspaceId,
    setupResult && !authStatus?.ready ? setupResult.domain : undefined,
  );

  const handleSetupDomain = async () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain || !domain.includes('.')) return;
    try {
      const result = await setupDomain.mutateAsync(domain);
      setSetupResult(result);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCloseWizard = () => {
    setShowAddWizard(false);
    setDomainInput('');
    setSetupResult(null);
  };

  const purposeLabels: Record<string, { title: string; required: boolean }> = {
    domain_verification: { title: 'Domain Verification', required: true },
    dkim: { title: 'DKIM (Email Authentication)', required: true },
    spf: { title: 'SPF (Sender Policy)', required: false },
    dmarc: { title: 'DMARC (Email Policy)', required: false },
  };

  // Renders DNS records for a given domain setup result (used by both wizard and saved domain view)
  const renderDnsRecords = (domain: DomainSetupResult, authData?: { verified: boolean; dkim_enabled: boolean; ready: boolean }) => {
    const records = domain.dns_records || [];
    const groups: Record<string, DnsRecord[]> = {};
    for (const rec of records) {
      if (!groups[rec.purpose]) groups[rec.purpose] = [];
      groups[rec.purpose].push(rec);
    }

    const getSectionStatus = (purpose: string) => {
      const auth = authData || domain;
      if (purpose === 'domain_verification') return auth.verified ? 'verified' : 'pending';
      if (purpose === 'dkim') return auth.ready ? 'verified' : 'pending';
      // SPF/DMARC status is only available on the domain object (not authData)
      if (purpose === 'spf') return domain.spf_valid ? 'verified' : 'pending';
      if (purpose === 'dmarc') return domain.dmarc_valid ? 'verified' : 'pending';
      return 'pending';
    };

    return (
      <div className="space-y-4">
        {(['domain_verification', 'dkim', 'spf', 'dmarc'] as const).map((purpose) => {
          const purposeRecords = groups[purpose] || [];
          if (purposeRecords.length === 0) return null;
          const info = purposeLabels[purpose];
          const status = getSectionStatus(purpose);

          return (
            <div key={purpose}>
              <div className="flex items-center gap-2 mb-2">
                {status === 'verified' ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
                <h4 className="text-sm font-medium text-gray-700">
                  {info.title}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                    info.required ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {info.required ? 'Required' : 'Recommended'}
                  </span>
                </h4>
              </div>
              <div className="space-y-2">
                {purposeRecords.map((record, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                        record.type === 'TXT' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {record.type}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Name / Host</label>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-xs bg-gray-50 rounded px-2 py-1.5 font-mono text-gray-800 break-all">
                            {record.name}
                          </code>
                          <button
                            onClick={() => handleCopy(record.name, `${domain.domain}-${purpose}-${idx}-name`)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                            title="Copy"
                          >
                            {copiedField === `${domain.domain}-${purpose}-${idx}-name` ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">Value</label>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-xs bg-gray-50 rounded px-2 py-1.5 font-mono text-gray-800 break-all">
                            {record.value}
                          </code>
                          <button
                            onClick={() => handleCopy(record.value, `${domain.domain}-${purpose}-${idx}-value`)}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                            title="Copy"
                          >
                            {copiedField === `${domain.domain}-${purpose}-${idx}-value` ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sending Domains</h2>
          <p className="text-sm text-gray-500">Verify domains for email sending across all your sites. Each site picks its sending domain in Site Setup.</p>
        </div>
        {!showAddWizard && (
          <button
            onClick={() => setShowAddWizard(true)}
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Domain
          </button>
        )}
      </div>

      {/* Add Domain Wizard */}
      {showAddWizard && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          {!setupResult ? (
            /* Step 1: Enter domain */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="yourcompany.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetupDomain()}
                />
                <button
                  onClick={handleSetupDomain}
                  disabled={!domainInput.trim() || !domainInput.includes('.') || setupDomain.isPending}
                  className="btn btn-primary inline-flex items-center gap-2"
                >
                  {setupDomain.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Set Up Domain
                </button>
                <button onClick={handleCloseWizard} className="btn btn-secondary">Cancel</button>
              </div>
              {setupDomain.isError && (
                <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {getApiErrorMessage(setupDomain.error, 'Failed to set up domain')}
                </p>
              )}
            </div>
          ) : (
            /* Step 2: DNS records display */
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">DNS Records for {setupResult.domain}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Add these records to your DNS provider. Changes can take up to 48 hours to propagate, but usually complete within minutes.
                  </p>
                </div>
                <button onClick={handleCloseWizard} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Success banner if ready */}
              {authStatus?.ready && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-sm">
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-700 font-medium">Domain is fully verified and ready to use!</span>
                </div>
              )}

              {renderDnsRecords(setupResult, authStatus || undefined)}

              {/* Verify button */}
              {!authStatus?.ready && (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => pollAuth.refetch()}
                    disabled={isCheckingAuth}
                    className="btn btn-secondary btn-sm inline-flex items-center gap-2"
                  >
                    {isCheckingAuth ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Verify DNS
                  </button>
                  <span className="text-xs text-gray-500">
                    Auto-checking every 30 seconds
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saved domains list */}
      {isLoadingDomains && (
        <div className="flex items-center justify-center py-6 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading domains...
        </div>
      )}

      {!isLoadingDomains && savedDomains.length > 0 && (
        <div className="mt-4 space-y-2">
          {savedDomains.map((domain) => {
            const isExpanded = expandedDomain === domain.domain;
            return (
              <div key={domain.domain} className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setExpandedDomain(isExpanded ? null : domain.domain)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{domain.domain}</span>
                    {domain.ready ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Verified</span>
                    ) : domain.verified ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">DKIM Pending</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Pending</span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-gray-100">
                    <div className="mt-3">
                      {domain.ready && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-sm">
                          <Check className="w-4 h-4 text-green-600" />
                          <span className="text-green-700 font-medium">Domain is fully verified and ready to use!</span>
                        </div>
                      )}
                      {renderDnsRecords(domain)}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                        {domain.ready && onNavigateToWarmup && (
                          <button
                            onClick={onNavigateToWarmup}
                            className="text-xs px-3 py-1.5 rounded-md bg-primary-100 text-primary-700 hover:bg-primary-200 transition-colors inline-flex items-center gap-1"
                          >
                            <TrendingUp className="w-3 h-3" />
                            Start Warm-up
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirmDeleteDomain === domain.domain) {
                              deleteDomain.mutate(domain.domain);
                              setConfirmDeleteDomain(null);
                              setExpandedDomain(null);
                            } else {
                              setConfirmDeleteDomain(domain.domain);
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                            confirmDeleteDomain === domain.domain
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                          {confirmDeleteDomain === domain.domain ? 'Click again to confirm' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isLoadingDomains && savedDomains.length === 0 && !showAddWizard && (
        <div className="mt-4 p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <Globe className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No domains configured</p>
          <p className="text-sm text-gray-500 mt-1">
            Add a domain to start sending emails from your own address
          </p>
        </div>
      )}
    </div>
  );
}

