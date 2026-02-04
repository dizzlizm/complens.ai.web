import { useState, useEffect } from 'react';
import { Bell, Shield, CreditCard, Users, Building, Globe, Zap, Loader2, Check, AlertCircle, ExternalLink } from 'lucide-react';
import { useCurrentWorkspace, useUpdateWorkspace, useStripeConnectStatus, useStartStripeConnect, useDisconnectStripe } from '../lib/hooks';
import TwilioConfigCard from '../components/settings/TwilioConfigCard';
import SegmentConfigCard from '../components/settings/SegmentConfigCard';
import TeamManagement from '../components/settings/TeamManagement';

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
    id: 'notifications',
    name: 'Notifications',
    icon: Bell,
    description: 'Configure how you receive notifications',
  },
  {
    id: 'integrations',
    name: 'Integrations',
    icon: Zap,
    description: 'Connect third-party services and APIs',
  },
  {
    id: 'billing',
    name: 'Billing',
    icon: CreditCard,
    description: 'Manage subscription and payment methods',
  },
  {
    id: 'security',
    name: 'Security',
    icon: Shield,
    description: 'Configure security settings and access',
  },
  {
    id: 'domains',
    name: 'Domains',
    icon: Globe,
    description: 'Manage custom domains and email settings',
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
        <div className="flex-1">
          {activeSection === 'workspace' && <WorkspaceSettings />}
          {activeSection === 'team' && <TeamSettings />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'integrations' && <IntegrationSettings />}
          {activeSection === 'billing' && <BillingSettings />}
          {activeSection === 'security' && <SecuritySettings />}
          {activeSection === 'domains' && <DomainSettings />}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSettings() {
  const { workspace, workspaceId, isLoading } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load workspace data
  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setTimezone(workspace.settings?.timezone || 'America/New_York');
    }
  }, [workspace]);

  const handleSave = async () => {
    if (!workspaceId) return;

    setSaveStatus('saving');
    try {
      await updateWorkspace.mutateAsync({
        name,
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
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Workspace Settings</h2>
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
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <select
            className="input"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              setHasChanges(true);
            }}
          >
            <option value="America/New_York">America/New_York (EST)</option>
            <option value="America/Chicago">America/Chicago (CST)</option>
            <option value="America/Denver">America/Denver (MST)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div className="pt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === 'saving'}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
            {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
          </button>
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600">Changes saved!</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-red-600">Failed to save</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamSettings() {
  const { workspaceId } = useCurrentWorkspace();
  return <TeamManagement workspaceId={workspaceId || ''} />;
}

function NotificationSettings() {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
      <div className="space-y-4">
        {[
          { label: 'Email notifications', description: 'Receive email updates about your workflows' },
          { label: 'Push notifications', description: 'Get browser notifications for important events' },
          { label: 'SMS alerts', description: 'Receive text messages for critical issues' },
          { label: 'Weekly digest', description: 'Get a weekly summary of your account activity' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
            <div>
              <p className="font-medium text-gray-900">{item.label}</p>
              <p className="text-sm text-gray-500">{item.description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrationSettings() {
  const { workspaceId } = useCurrentWorkspace();

  return (
    <div className="space-y-6">
      {/* Stripe Connect */}
      <StripeIntegrationCard workspaceId={workspaceId || ''} />

      {/* Twilio */}
      <TwilioConfigCard workspaceId={workspaceId || ''} />

      {/* Segment */}
      <SegmentConfigCard workspaceId={workspaceId || ''} />

      {/* Coming Soon Integrations */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">More Integrations</h2>
        <div className="space-y-3">
          {[
            { name: 'Slack', description: 'Team notifications', comingSoon: true },
            { name: 'Zapier', description: 'Workflow automation', comingSoon: true },
          ].map((integration) => (
            <div
              key={integration.name}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {integration.name}
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      Coming Soon
                    </span>
                  </p>
                  <p className="text-sm text-gray-500">{integration.description}</p>
                </div>
              </div>
              <button className="btn btn-primary" disabled>
                Connect
              </button>
            </div>
          ))}
        </div>
      </div>
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

      // Redirect to Stripe OAuth
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
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stripe Connect</h2>
            <p className="text-sm text-gray-500">Accept payments from your landing pages</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  const isConnected = stripeStatus?.connected;
  const account = stripeStatus?.account;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stripe Connect</h2>
            <p className="text-sm text-gray-500">Accept payments from your landing pages</p>
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
            <Check className="w-4 h-4" />
            Connected
          </div>
        )}
      </div>

      {isConnected ? (
        <>
          <div className="p-4 bg-gray-50 rounded-lg mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Account</p>
                <p className="font-medium text-gray-900">{account?.email || 'Connected'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Mode</p>
                <p className="font-medium text-gray-900">
                  {stripeStatus?.livemode ? 'Live' : 'Test'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Charges</p>
                <p className="font-medium text-gray-900 flex items-center gap-1">
                  {account?.charges_enabled ? (
                    <><Check className="w-4 h-4 text-green-600" /> Enabled</>
                  ) : (
                    <><AlertCircle className="w-4 h-4 text-yellow-600" /> Pending</>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Payouts</p>
                <p className="font-medium text-gray-900 flex items-center gap-1">
                  {account?.payouts_enabled ? (
                    <><Check className="w-4 h-4 text-green-600" /> Enabled</>
                  ) : (
                    <><AlertCircle className="w-4 h-4 text-yellow-600" /> Pending</>
                  )}
                </p>
              </div>
            </div>
          </div>

          {!account?.details_submitted && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">Complete your Stripe setup</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    You need to complete your Stripe account setup to start accepting payments.
                  </p>
                  <a
                    href="https://dashboard.stripe.com/connect/accounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-yellow-800 font-medium mt-2 hover:underline"
                  >
                    Complete setup in Stripe <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-gray-500">
              Connected account: {stripeStatus?.stripe_account_id}
            </p>
            {showDisconnectConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Are you sure?</span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnectStripe.isPending}
                  className="btn btn-sm bg-red-600 hover:bg-red-700 text-white"
                >
                  {disconnectStripe.isPending ? 'Disconnecting...' : 'Yes, Disconnect'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="btn btn-sm btn-secondary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Disconnect
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="p-4 bg-gray-50 rounded-lg mb-4">
            <h3 className="font-medium text-gray-900 mb-2">What you can do with Stripe:</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Accept one-time payments on landing pages
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Create recurring subscriptions
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Trigger workflows on payment events
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Automatic platform fee collection (2%)
              </li>
            </ul>
          </div>

          <button
            onClick={handleConnect}
            disabled={startConnect.isPending || !workspaceId}
            className="btn btn-primary w-full flex items-center justify-center gap-2"
          >
            {startConnect.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            {startConnect.isPending ? 'Connecting...' : 'Connect with Stripe'}
          </button>

          {startConnect.isError && (
            <p className="text-sm text-red-600 mt-2 text-center">
              Failed to connect. Please try again.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BillingSettings() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h2>
        <div className="flex items-center justify-between p-4 bg-primary-50 rounded-lg">
          <div>
            <p className="font-semibold text-primary-900">Free Trial</p>
            <p className="text-sm text-primary-700">14 days remaining</p>
          </div>
          <button className="btn btn-primary">Upgrade Plan</button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Method</h2>
        <p className="text-gray-500">No payment method on file</p>
        <button className="btn btn-secondary mt-4">Add Payment Method</button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing History</h2>
        <p className="text-gray-500">No invoices yet</p>
      </div>
    </div>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Password</h2>
        <p className="text-sm text-gray-500 mb-4">
          Change your password to keep your account secure
        </p>
        <button className="btn btn-secondary">Change Password</button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Two-Factor Authentication</h2>
        <p className="text-sm text-gray-500 mb-4">
          Add an extra layer of security to your account
        </p>
        <button className="btn btn-primary">Enable 2FA</button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Current Session</p>
              <p className="text-sm text-gray-500">Chrome on macOS - Active now</p>
            </div>
            <span className="text-xs text-green-600 font-medium">Current</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainSettings() {
  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Domains</h2>
        <p className="text-sm text-gray-500 mb-4">
          Connect your own domain for branded emails and landing pages
        </p>
        <button className="btn btn-primary">Add Domain</button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default From Name
            </label>
            <input type="text" className="input" placeholder="Your Company" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Reply-To Email
            </label>
            <input type="email" className="input" placeholder="support@yourcompany.com" />
          </div>
          <button className="btn btn-primary">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
