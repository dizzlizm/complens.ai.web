import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  Bell, Shield, CreditCard, Users, Building, Globe, Zap, Loader2, Check, AlertCircle,
  ExternalLink, Mail, Monitor, LogOut, Plus, ChevronRight, ChevronDown,
  MessageSquare, BarChart3, FileText,
  Pause, Play, Trash2, AlertTriangle, TrendingUp, X, Eye, Copy, Clock, RefreshCw, SlidersHorizontal
} from 'lucide-react';
import { useCurrentWorkspace, useUpdateWorkspace, useStripeConnectStatus, useStartStripeConnect, useDisconnectStripe, useWarmups, useStartWarmup, usePauseWarmup, useResumeWarmup, useCancelWarmup, useCheckDomainAuth, getWarmupStatusInfo, useUpdateSeedList, useUpdateWarmupSettings, useWarmupLog, useDomainHealth, getHealthStatusInfo, useSetupDomain, useListDomains, useDeleteSavedDomain } from '../lib/hooks';
import type { WarmupDomain, DomainSetupResult, DnsRecord } from '../lib/hooks/useEmailWarmup';
import { useBillingStatus, useCreateCheckout, useCreatePortal } from '../lib/hooks/useBilling';
import TwilioConfigCard from '../components/settings/TwilioConfigCard';
import SegmentConfigCard from '../components/settings/SegmentConfigCard';
import TeamManagement from '../components/settings/TeamManagement';
import PricingTable from '../components/settings/PricingTable';
import { TimezoneSelect } from '../components/ui';

// Email provider detection for seed list coverage indicator
const EMAIL_PROVIDERS: { name: string; domains: string[]; color: string }[] = [
  { name: 'Gmail', domains: ['gmail.com', 'googlemail.com'], color: 'bg-red-100 text-red-700' },
  { name: 'Outlook', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], color: 'bg-blue-100 text-blue-700' },
  { name: 'Yahoo', domains: ['yahoo.com', 'ymail.com', 'yahoo.co.uk'], color: 'bg-violet-100 text-violet-700' },
  { name: 'iCloud', domains: ['icloud.com', 'me.com', 'mac.com'], color: 'bg-gray-100 text-gray-700' },
];

function getProviderCoverage(emails: string[]): { name: string; color: string; count: number }[] {
  const coverage: { name: string; color: string; count: number }[] = [];
  for (const provider of EMAIL_PROVIDERS) {
    const count = emails.filter(e => provider.domains.some(d => e.endsWith('@' + d))).length;
    if (count > 0) coverage.push({ name: provider.name, color: provider.color, count });
  }
  const knownCount = coverage.reduce((sum, p) => sum + p.count, 0);
  const otherCount = emails.length - knownCount;
  if (otherCount > 0) coverage.push({ name: 'Other', color: 'bg-gray-100 text-gray-600', count: otherCount });
  return coverage;
}

function parseBulkEmails(input: string, existing: string[]): string[] {
  const raw = input.split(/[\s,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid: string[] = [];
  const existingSet = new Set(existing);
  for (const email of raw) {
    if (email.includes('@') && email.includes('.') && !existingSet.has(email) && !valid.includes(email)) {
      valid.push(email);
    }
  }
  return valid;
}

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
    id: 'email',
    name: 'Email & Domains',
    icon: Mail,
    description: 'Email sending and domain verification',
  },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState('workspace');

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
          {activeSection === 'email' && <EmailDomainSettings />}
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
      console.error('Failed to save workspace:', error);
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
    } catch (error) {
      console.error('Failed to start Stripe Connect:', error);
    }
  };

  const handleDisconnect = async () => {
    if (!workspaceId) return;
    try {
      await disconnectStripe.mutateAsync({ workspaceId });
      setShowDisconnectConfirm(false);
    } catch (error) {
      console.error('Failed to disconnect Stripe:', error);
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
      console.error('Failed to create checkout:', err);
      setLoadingPlan('');
    }
  };

  const handleManageBilling = async () => {
    try {
      const result = await createPortal.mutateAsync();
      window.location.href = result.url;
    } catch (err) {
      console.error('Failed to open portal:', err);
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

function EmailDomainSettings() {
  const { workspace, workspaceId } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [prefillWarmupDomain, setPrefillWarmupDomain] = useState<string | null>(null);

  useEffect(() => {
    if (workspace) {
      setFromEmail(workspace.from_email || '');
      setFromName(workspace.settings?.from_name || '');
      setReplyTo(workspace.settings?.reply_to || '');
    }
  }, [workspace]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateWorkspace.mutateAsync({
        from_email: fromEmail || undefined,
        settings: { ...workspace?.settings, from_name: fromName, reply_to: replyTo },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save:', error);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Email Sending Defaults */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Email Sending Defaults</h2>
        <p className="text-sm text-gray-500 mb-4">Configure default sender information for workflow emails</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
            <input
              type="text"
              className="input"
              placeholder="Your Company"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
            <input
              type="email"
              className="input"
              placeholder="hello@yourcompany.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Must be verified in your email provider</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To Email</label>
            <input
              type="email"
              className="input"
              placeholder="support@yourcompany.com"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="btn btn-primary inline-flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
            {saved && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="w-4 h-4" /> Saved</span>}
          </div>
        </div>
      </div>

      {/* Sending Domains */}
      <SendingDomainsCard workspaceId={workspaceId} onStartWarmup={(domain) => setPrefillWarmupDomain(domain)} />

      {/* Email Warm-up */}
      <EmailWarmupSection workspaceId={workspaceId} prefillDomain={prefillWarmupDomain} onPrefillConsumed={() => setPrefillWarmupDomain(null)} />
    </div>
  );
}

function SendingDomainsCard({ workspaceId, onStartWarmup }: { workspaceId: string | undefined; onStartWarmup: (domain: string) => void }) {
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
    dkim: { title: 'DKIM', required: true },
    spf: { title: 'SPF', required: false },
    dmarc: { title: 'DMARC', required: false },
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
      if (purpose === 'dkim') return auth.dkim_enabled ? 'verified' : 'pending';
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
          <p className="text-sm text-gray-500">Set up and verify domains for email sending</p>
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
                  {(setupDomain.error as any)?.response?.data?.error || 'Failed to set up domain'}
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
                  <span className="text-green-700 font-medium">Domain is fully verified and ready for sending!</span>
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
                          <span className="text-green-700 font-medium">Domain is fully verified and ready for sending!</span>
                        </div>
                      )}
                      {renderDnsRecords(domain)}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                        {domain.ready && (
                          <button
                            onClick={() => onStartWarmup(domain.domain)}
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

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00 UTC`,
}));

function EmailWarmupSection({ workspaceId, prefillDomain, onPrefillConsumed }: {
  workspaceId: string | undefined;
  prefillDomain?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const { data: warmupsData, isLoading } = useWarmups(workspaceId);
  const startWarmup = useStartWarmup(workspaceId || '');
  const pauseWarmup = usePauseWarmup(workspaceId || '');
  const resumeWarmup = useResumeWarmup(workspaceId || '');
  const cancelWarmup = useCancelWarmup(workspaceId || '');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [sendWindowStart, setSendWindowStart] = useState(9);
  const [sendWindowEnd, setSendWindowEnd] = useState(19);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [initSeedInput, setInitSeedInput] = useState('');
  const [initSeedList, setInitSeedList] = useState<string[]>([]);
  const [initAutoWarmup, setInitAutoWarmup] = useState(false);
  const [startedSuccess, setStartedSuccess] = useState(false);

  // Handle prefill from domain card
  useEffect(() => {
    if (prefillDomain) {
      setNewDomain(prefillDomain);
      setShowAddForm(true);
      onPrefillConsumed?.();
    }
  }, [prefillDomain]);

  const { data: authStatus, isLoading: isCheckingAuth } = useCheckDomainAuth(
    workspaceId,
    showAddForm ? newDomain.trim().toLowerCase() : undefined,
  );

  const warmups = warmupsData?.items || [];

  const handleStartWarmup = async () => {
    if (!newDomain.trim()) return;
    try {
      await startWarmup.mutateAsync({
        domain: newDomain.trim().toLowerCase(),
        send_window_start: sendWindowStart,
        send_window_end: sendWindowEnd,
        seed_list: initSeedList.length > 0 ? initSeedList : undefined,
        auto_warmup_enabled: initAutoWarmup,
      });
      setNewDomain('');
      setInitSeedList([]);
      setInitAutoWarmup(false);
      setShowAddForm(false);
      setStartedSuccess(true);
      setTimeout(() => setStartedSuccess(false), 3000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCancel = async (domain: string) => {
    try {
      await cancelWarmup.mutateAsync(domain);
      setConfirmCancel(null);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Domain Warm-up</h2>
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">Pro</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Start Warm-up
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Gradually ramp up sending volume on new domains to build reputation and avoid spam filters
      </p>

      {/* Add domain form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="yourcompany.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && authStatus?.ready && handleStartWarmup()}
            />
          </div>

          {/* Domain auth status */}
          {newDomain.includes('.') && (
            <div className="mt-3 space-y-2">
              {isCheckingAuth ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking domain authentication...
                </div>
              ) : authStatus ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    {authStatus.verified ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={authStatus.verified ? 'text-green-700' : 'text-red-600'}>
                      Domain verified: {authStatus.verified ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {authStatus.dkim_enabled ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={authStatus.dkim_enabled ? 'text-green-700' : 'text-red-600'}>
                      DKIM configured: {authStatus.dkim_enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {!authStatus.ready && !authStatus.error && (
                    <p className="text-xs text-amber-600 mt-1">
                      Domain must be verified first. Use the "Add Domain" wizard in the Sending Domains section above.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Send window */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Send window start (UTC)</label>
              <select
                className="input text-sm"
                value={sendWindowStart}
                onChange={(e) => setSendWindowStart(Number(e.target.value))}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Send window end (UTC)</label>
              <select
                className="input text-sm"
                value={sendWindowEnd}
                onChange={(e) => setSendWindowEnd(Number(e.target.value))}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional seed list */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Seed List (optional)</label>
              {initSeedList.length > 0 && (
                <span className="text-xs text-gray-400">{initSeedList.length}/50</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Add email addresses you control (team inboxes, aliases) to receive warmup emails.
              Paste multiple emails separated by commas, spaces, or newlines.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="team@gmail.com, founder@outlook.com, hello@yahoo.com"
                value={initSeedInput}
                onChange={(e) => setInitSeedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const newEmails = parseBulkEmails(initSeedInput, initSeedList);
                    if (newEmails.length > 0) {
                      setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                      setInitSeedInput('');
                    }
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted.includes(',') || pasted.includes('\n') || pasted.includes(' ')) {
                    e.preventDefault();
                    const newEmails = parseBulkEmails(pasted, initSeedList);
                    if (newEmails.length > 0) {
                      setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                      setInitSeedInput('');
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const newEmails = parseBulkEmails(initSeedInput, initSeedList);
                  if (newEmails.length > 0) {
                    setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                    setInitSeedInput('');
                  }
                }}
                disabled={!initSeedInput.trim() || initSeedList.length >= 50}
                className="btn btn-secondary btn-sm"
              >
                Add
              </button>
            </div>
            {initSeedList.length > 0 && (
              <>
                {/* Provider coverage */}
                <div className="flex items-center gap-1.5 mb-2">
                  {getProviderCoverage(initSeedList).map((p) => (
                    <span key={p.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.color}`}>
                      {p.name} ({p.count})
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {initSeedList.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
                      {email}
                      <button onClick={() => setInitSeedList(initSeedList.filter(e => e !== email))} className="text-gray-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={initAutoWarmup}
                      onChange={(e) => setInitAutoWarmup(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Enable auto-warmup (send AI emails hourly)
                  </label>
                  <button
                    onClick={() => setInitSeedList([])}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Clear all
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleStartWarmup}
              disabled={!newDomain.trim() || startWarmup.isPending || (authStatus && !authStatus.ready && !authStatus.error)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {startWarmup.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Warm-up
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewDomain(''); setInitSeedList([]); setInitAutoWarmup(false); }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
          {startWarmup.isError && (
            <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {(startWarmup.error as any)?.response?.data?.error || 'Failed to start warm-up'}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Emails from this domain will be gradually ramped up over 6 weeks (10 &rarr; 10,000/day)
          </p>
        </div>
      )}

      {/* Success banner */}
      {startedSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-sm">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-green-700 font-medium">Warm-up started successfully!</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading warm-up domains...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && warmups.length === 0 && !showAddForm && (
        <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <TrendingUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No domains warming up</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Domain warm-up gradually increases your sending volume over 6 weeks, building a positive
            reputation with email providers so your messages land in the inbox instead of spam.
          </p>
        </div>
      )}

      {/* Warmup list */}
      {warmups.length > 0 && (
        <div className="space-y-3">
          {warmups.map((warmup) => (
            <WarmupDomainCard
              key={warmup.domain}
              warmup={warmup}
              workspaceId={workspaceId || ''}
              onPause={(d) => pauseWarmup.mutate(d)}
              onResume={(d) => resumeWarmup.mutate(d)}
              onCancel={(d) => confirmCancel === d ? handleCancel(d) : setConfirmCancel(d)}
              confirmingCancel={confirmCancel === warmup.domain}
              isPausing={pauseWarmup.isPending}
              isResuming={resumeWarmup.isPending}
              isCancelling={cancelWarmup.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WarmupDomainCard({
  warmup,
  workspaceId,
  onPause,
  onResume,
  onCancel,
  confirmingCancel,
}: {
  warmup: WarmupDomain;
  workspaceId: string;
  onPause: (domain: string) => void;
  onResume: (domain: string) => void;
  onCancel: (domain: string) => void;
  confirmingCancel: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isCancelling: boolean;
}) {
  const statusInfo = getWarmupStatusInfo(warmup.status);
  const progress = warmup.schedule_length > 0
    ? Math.round((warmup.warmup_day / warmup.schedule_length) * 100)
    : 0;

  const [isExpanded, setIsExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<'health' | 'seedlist' | 'log' | 'settings' | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const [editSeedList, setEditSeedList] = useState<string[]>(warmup.seed_list || []);
  const [editAutoWarmup, setEditAutoWarmup] = useState(warmup.auto_warmup_enabled);
  const [editFromName, setEditFromName] = useState(warmup.from_name || '');
  const [seedListSaved, setSeedListSaved] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Settings panel state
  const [editSendWindowStart, setEditSendWindowStart] = useState(warmup.send_window_start);
  const [editSendWindowEnd, setEditSendWindowEnd] = useState(warmup.send_window_end);
  const [editMaxBounce, setEditMaxBounce] = useState(warmup.max_bounce_rate);
  const [editMaxComplaint, setEditMaxComplaint] = useState(warmup.max_complaint_rate);
  const [editRemainingSchedule, setEditRemainingSchedule] = useState(
    warmup.schedule?.slice(warmup.warmup_day).join(', ') || ''
  );

  const updateSeedList = useUpdateSeedList(workspaceId);
  const updateSettings = useUpdateWarmupSettings(workspaceId);
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useDomainHealth(
    workspaceId,
    warmup.domain,
    activePanel === 'health',
  );
  const { data: logData, isLoading: logLoading } = useWarmupLog(
    activePanel === 'log' ? workspaceId : undefined,
    activePanel === 'log' ? warmup.domain : undefined,
  );

  const handleRemoveSeedEmail = (email: string) => {
    setEditSeedList(editSeedList.filter((e) => e !== email));
  };

  const handleSaveSeedList = async () => {
    try {
      await updateSeedList.mutateAsync({
        domain: warmup.domain,
        seed_list: editSeedList,
        auto_warmup_enabled: editAutoWarmup,
        from_name: editFromName || undefined,
      });
      setSeedListSaved(true);
      setTimeout(() => setSeedListSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSaveSettings = async () => {
    try {
      const scheduleValues = editRemainingSchedule
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      await updateSettings.mutateAsync({
        domain: warmup.domain,
        send_window_start: editSendWindowStart,
        send_window_end: editSendWindowEnd,
        max_bounce_rate: editMaxBounce,
        max_complaint_rate: editMaxComplaint,
        schedule: scheduleValues.length > 0 ? scheduleValues : undefined,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
  };

  const togglePanel = (panel: typeof activePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  const todayProgress = warmup.today ? Math.round((warmup.today.send_count / Math.max(warmup.today.daily_limit, 1)) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Collapsed header row - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-900 truncate">{warmup.domain}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusInfo.color} ${statusInfo.bgColor}`}>
            {statusInfo.label}
          </span>
          {warmup.auto_warmup_enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-emerald-700 bg-emerald-100 shrink-0">
              Auto
            </span>
          )}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <span className="text-xs text-gray-500 shrink-0">Day {warmup.warmup_day + 1}/{warmup.schedule_length}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {warmup.status === 'active' && (
            <span
              onClick={(e) => { e.stopPropagation(); onPause(warmup.domain); }}
              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
              title="Pause warm-up"
            >
              <Pause className="w-4 h-4" />
            </span>
          )}
          {warmup.status === 'paused' && (
            <span
              onClick={(e) => { e.stopPropagation(); onResume(warmup.domain); }}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors cursor-pointer"
              title="Resume warm-up"
            >
              <Play className="w-4 h-4" />
            </span>
          )}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <span
              onClick={(e) => { e.stopPropagation(); onCancel(warmup.domain); }}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                confirmingCancel
                  ? 'text-red-600 bg-red-50'
                  : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
              }`}
              title={confirmingCancel ? 'Click again to confirm' : 'Cancel warm-up'}
            >
              <Trash2 className="w-4 h-4" />
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 ml-1" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Auto-pause alert */}
          {warmup.status === 'paused' && warmup.pause_reason && warmup.pause_reason !== 'manual' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Auto-paused</p>
                <p className="text-amber-700">{warmup.pause_reason}</p>
              </div>
            </div>
          )}

          {/* Low engagement warning */}
          {warmup.low_engagement_warning && warmup.status === 'active' && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mt-3 text-sm">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800">Low engagement detected</p>
                <p className="text-blue-700">
                  Open rate is below 5% ({warmup.open_rate.toFixed(1)}%). Consider reviewing your email content, subject lines, and sending reputation.
                </p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Day {warmup.warmup_day + 1} of {warmup.schedule_length}</span>
                <span>{warmup.daily_limit === -1 ? 'Unlimited' : `${warmup.daily_limit.toLocaleString()}/day limit`}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    warmup.status === 'paused' ? 'bg-amber-400' : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Today's Progress */}
          {warmup.today && (warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-blue-800">Today's Progress</span>
                <span className="text-blue-600">{warmup.today.send_count} / {warmup.today.daily_limit}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(todayProgress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Completed state */}
          {warmup.status === 'completed' && (
            <div className="flex items-center gap-2 text-sm text-green-600 mt-3">
              <Check className="w-4 h-4" />
              <span>Warm-up complete - no sending limits enforced</span>
            </div>
          )}

          {/* Engagement stats */}
          <div className="space-y-2 mt-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Sent</p>
                <p className="text-sm font-semibold text-gray-900">{warmup.total_sent.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Delivered</p>
                <p className="text-sm font-semibold text-gray-900">{warmup.total_delivered.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Opens</p>
                <p className="text-sm font-semibold text-gray-900">
                  {warmup.total_opens.toLocaleString()}
                  {warmup.total_delivered > 0 && (
                    <span className="text-xs text-gray-500 font-normal ml-1">({warmup.open_rate.toFixed(1)}%)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Bounces</p>
                <p className={`text-sm font-semibold ${warmup.bounce_rate > warmup.max_bounce_rate ? 'text-red-600' : 'text-gray-900'}`}>
                  {warmup.total_bounced.toLocaleString()}
                  <span className="text-xs font-normal ml-1">({warmup.bounce_rate.toFixed(2)}%)</span>
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Complaints</p>
                <p className={`text-sm font-semibold ${warmup.complaint_rate > warmup.max_complaint_rate ? 'text-red-600' : 'text-gray-900'}`}>
                  {warmup.total_complaints.toLocaleString()}
                  <span className="text-xs font-normal ml-1">({warmup.complaint_rate.toFixed(3)}%)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => togglePanel('health')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'health' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Shield className="w-3 h-3" />
                Health
              </button>
              <button
                onClick={() => togglePanel('seedlist')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  activePanel === 'seedlist' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Seed List ({warmup.seed_list?.length || 0})
              </button>
              <button
                onClick={() => togglePanel('settings')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'settings' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                Settings
              </button>
              <button
                onClick={() => togglePanel('log')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'log' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-3 h-3" />
                View Log
              </button>
            </div>
          )}

          {/* Health Panel */}
          {activePanel === 'health' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              {healthLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  <span className="text-sm text-gray-500 ml-2">Running health checks...</span>
                </div>
              ) : healthData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`text-lg font-bold px-3 py-1 rounded-lg ${getHealthStatusInfo(healthData.status).bgColor} ${getHealthStatusInfo(healthData.status).color}`}>
                        {healthData.score}/100
                      </div>
                      <span className={`text-sm font-medium ${getHealthStatusInfo(healthData.status).color}`}>
                        {getHealthStatusInfo(healthData.status).label}
                      </span>
                    </div>
                    <button onClick={() => refetchHealth()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Authentication</h5>
                    <div className="space-y-1.5">
                      {[
                        { valid: healthData.spf_valid, label: 'SPF', key: 'spf', max: 15 },
                        { valid: healthData.dkim_enabled, label: 'DKIM', key: 'dkim', max: 15 },
                        { valid: healthData.dmarc_valid, label: `DMARC${healthData.dmarc_policy ? ` (${healthData.dmarc_policy})` : ''}`, key: 'dmarc', max: 15, extra: 'dmarc_enforce' },
                      ].map(({ valid, label, key, max, extra }) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {valid ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                            <span className="text-gray-700">{label}</span>
                          </div>
                          <span className="text-xs text-gray-500">+{(healthData.score_breakdown?.[key] || 0) + (extra ? (healthData.score_breakdown?.[extra] || 0) : 0)}/{max}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Blacklist</h5>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {!healthData.blacklisted ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                        <span className="text-gray-700">
                          {healthData.blacklisted ? `Listed on ${healthData.blacklist_listings.length} blacklist(s)` : 'Not blacklisted'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">+{healthData.score_breakdown?.blacklist || 0}/20</span>
                    </div>
                    {healthData.blacklisted && healthData.blacklist_listings.length > 0 && (
                      <div className="mt-1 ml-6 text-xs text-red-600">{healthData.blacklist_listings.join(', ')}</div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reputation</h5>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">Bounce rate: {healthData.bounce_rate.toFixed(2)}%</span>
                        <span className="text-xs text-gray-500">+{healthData.score_breakdown?.bounce || 0}/15</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">Complaint rate: {healthData.complaint_rate.toFixed(3)}%</span>
                        <span className="text-xs text-gray-500">+{healthData.score_breakdown?.complaint || 0}/10</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement</h5>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Open rate: {healthData.open_rate.toFixed(1)}%</span>
                      <span className="text-xs text-gray-500">+{healthData.score_breakdown?.open_rate || 0}/10</span>
                    </div>
                  </div>

                  {healthData.errors.length > 0 && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      <p className="font-medium mb-1">Partial results (some checks failed):</p>
                      {healthData.errors.map((err, i) => <p key={i}>{err}</p>)}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-200">
                    <span>
                      {healthData.cached ? 'Cached' : 'Fresh'} &middot; {healthData.checked_at ? new Date(healthData.checked_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">Failed to load health data</p>
              )}
            </div>
          )}

          {/* Seed List Panel */}
          {activePanel === 'seedlist' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">Seed List</h4>
                <span className="text-xs text-gray-400">{editSeedList.length}/50 emails</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Add email addresses you control (team inboxes, aliases) that receive your warmup emails.
                Open and reply to these to signal positive engagement. Use addresses across different providers (Gmail, Outlook, Yahoo) for better coverage.
              </p>

              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder="Paste or type emails — comma, space, or newline separated"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const newEmails = parseBulkEmails(seedInput, editSeedList);
                      if (newEmails.length > 0) {
                        setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                        setSeedInput('');
                      }
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted.includes(',') || pasted.includes('\n') || pasted.includes(' ')) {
                      e.preventDefault();
                      const newEmails = parseBulkEmails(pasted, editSeedList);
                      if (newEmails.length > 0) {
                        setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                        setSeedInput('');
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const newEmails = parseBulkEmails(seedInput, editSeedList);
                    if (newEmails.length > 0) {
                      setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                      setSeedInput('');
                    }
                  }}
                  disabled={!seedInput.trim() || editSeedList.length >= 50}
                  className="btn btn-secondary btn-sm"
                >
                  Add
                </button>
              </div>

              {editSeedList.length > 0 && (
                <>
                  {/* Provider coverage */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {getProviderCoverage(editSeedList).map((p) => (
                      <span key={p.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.color}`}>
                        {p.name} ({p.count})
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editSeedList.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
                        {email}
                        <button onClick={() => handleRemoveSeedEmail(email)} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => setEditSeedList([])}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Missing provider hints */}
                  {(() => {
                    const covered = getProviderCoverage(editSeedList).map(p => p.name);
                    const missing = EMAIL_PROVIDERS.filter(p => !covered.includes(p.name));
                    if (missing.length === 0 || editSeedList.length === 0) return null;
                    return (
                      <p className="text-xs text-amber-600 mb-2">
                        Tip: Add addresses from {missing.map(m => m.name).join(', ')} for better provider coverage
                      </p>
                    );
                  })()}
                </>
              )}

              {editSeedList.length === 0 && (
                <p className="text-xs text-gray-400 mb-3 italic">No seed emails yet. Add your team inboxes and aliases above.</p>
              )}

              <div className="flex items-center justify-between py-2 border-t border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-700">Auto-warmup</p>
                  <p className="text-xs text-gray-500">Send AI-generated warmup emails hourly</p>
                </div>
                <button
                  onClick={() => setEditAutoWarmup(!editAutoWarmup)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    editAutoWarmup ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    editAutoWarmup ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="py-2 border-t border-gray-200">
                <label className="block text-xs font-medium text-gray-600 mb-1">From Name</label>
                <input
                  type="text"
                  className="input text-sm"
                  placeholder={warmup.domain}
                  value={editFromName}
                  onChange={(e) => setEditFromName(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleSaveSeedList}
                  disabled={updateSeedList.isPending || editSeedList.length === 0}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  {updateSeedList.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
                {seedListSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {activePanel === 'settings' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Warmup Settings</h4>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send window start (UTC)</label>
                  <select
                    className="input text-sm"
                    value={editSendWindowStart}
                    onChange={(e) => setEditSendWindowStart(Number(e.target.value))}
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>{h.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send window end (UTC)</label>
                  <select
                    className="input text-sm"
                    value={editSendWindowEnd}
                    onChange={(e) => setEditSendWindowEnd(Number(e.target.value))}
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>{h.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max bounce rate (%)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    step="0.1"
                    min="0.1"
                    max="50"
                    value={editMaxBounce}
                    onChange={(e) => setEditMaxBounce(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max complaint rate (%)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    step="0.01"
                    min="0.01"
                    max="5"
                    value={editMaxComplaint}
                    onChange={(e) => setEditMaxComplaint(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Remaining schedule (comma-separated daily limits)
                </label>
                <textarea
                  className="input text-sm font-mono"
                  rows={2}
                  placeholder="100, 200, 300, 500, ..."
                  value={editRemainingSchedule}
                  onChange={(e) => setEditRemainingSchedule(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {warmup.schedule_length - warmup.warmup_day} days remaining in current schedule
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={updateSettings.isPending}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  {updateSettings.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save Settings
                </button>
                {settingsSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
                {updateSettings.isError && (
                  <span className="text-xs text-red-600">Failed to save</span>
                )}
              </div>
            </div>
          )}

          {/* Warmup Log Panel */}
          {activePanel === 'log' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Warmup Email Log</h4>
              {logLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : logData?.items && logData.items.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {logData.items.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0 text-xs">
                      <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 truncate">{entry.subject}</p>
                        <p className="text-gray-500">
                          To: {entry.recipient} &middot; {entry.content_type}
                          {entry.sent_at && <> &middot; {new Date(entry.sent_at).toLocaleString()}</>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">No warmup emails sent yet</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
