import { useState } from 'react';
import { Bell, Shield, CreditCard, Users, Building, Globe, Zap } from 'lucide-react';

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
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Workspace Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Workspace Name
          </label>
          <input type="text" className="input" defaultValue="My Workspace" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Workspace ID
          </label>
          <input
            type="text"
            className="input bg-gray-50"
            defaultValue="ws_123456789"
            disabled
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Timezone
          </label>
          <select className="input">
            <option>America/New_York (EST)</option>
            <option>America/Chicago (CST)</option>
            <option>America/Denver (MST)</option>
            <option>America/Los_Angeles (PST)</option>
            <option>UTC</option>
          </select>
        </div>
        <div className="pt-4">
          <button className="btn btn-primary">Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function TeamSettings() {
  const teamMembers = [
    { name: 'John Doe', email: 'john@example.com', role: 'Owner', status: 'Active' },
    { name: 'Jane Smith', email: 'jane@example.com', role: 'Admin', status: 'Active' },
    { name: 'Bob Wilson', email: 'bob@example.com', role: 'Member', status: 'Pending' },
  ];

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
        <button className="btn btn-primary">Invite Member</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Member
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {teamMembers.map((member) => (
              <tr key={member.email}>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{member.name}</p>
                    <p className="text-sm text-gray-500">{member.email}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{member.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      member.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {member.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-sm text-primary-600 hover:text-primary-700">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const integrations = [
    { name: 'Twilio', description: 'SMS messaging and phone calls', connected: false },
    { name: 'Segment', description: 'Customer data platform', connected: true },
    { name: 'Stripe', description: 'Payment processing', connected: false },
    { name: 'Slack', description: 'Team notifications', connected: false },
    { name: 'Zapier', description: 'Workflow automation', connected: false },
  ];

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Integrations</h2>
      <div className="space-y-3">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{integration.name}</p>
                <p className="text-sm text-gray-500">{integration.description}</p>
              </div>
            </div>
            <button
              className={`btn ${
                integration.connected ? 'btn-secondary' : 'btn-primary'
              }`}
            >
              {integration.connected ? 'Configure' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
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
