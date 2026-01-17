import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';

interface Account {
  accountId: string;
  platform: string;
  email?: string;
  status: string;
  lastScannedAt?: string;
  createdAt: string;
}

const PLATFORMS = [
  { id: 'google', name: 'Google', color: 'bg-red-500', description: 'Gmail, Drive, Calendar, etc.' },
  { id: 'microsoft', name: 'Microsoft', color: 'bg-blue-500', description: 'Outlook, OneDrive, Teams, etc.' },
  { id: 'github', name: 'GitHub', color: 'bg-gray-800', description: 'Repositories, Actions, Packages' },
  { id: 'slack', name: 'Slack', color: 'bg-purple-500', description: 'Workspaces, channels, DMs' },
  { id: 'dropbox', name: 'Dropbox', color: 'bg-blue-600', description: 'Files and folders' },
];

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [scanning, setScanningId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const res = await api.getAccounts();
      setAccounts(res.accounts);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect(platform: string) {
    // TODO: Implement proper OAuth flow
    // For now, show a message
    alert(`OAuth flow for ${platform} coming soon! This will redirect you to ${platform} to authorize access.`);
    setShowModal(false);
  }

  async function handleScan(accountId: string) {
    setScanningId(accountId);
    try {
      await api.startScan(accountId);
      await loadAccounts();
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setScanningId(null);
    }
  }

  async function handleDelete(accountId: string) {
    if (!confirm('Remove this account? This will also remove all discovered apps.')) return;
    try {
      await api.deleteAccount(accountId);
      setAccounts(accounts.filter(a => a.accountId !== accountId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Connected Accounts</h1>
          <p className="text-gray-500 text-sm">Manage your linked services</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
          <div className="text-gray-400 mb-4">
            <Plus className="w-12 h-12 mx-auto" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No accounts connected</h2>
          <p className="text-gray-500 text-sm mb-4">
            Connect an account to start discovering third-party apps with access to your data.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
          >
            Connect your first account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(account => (
            <div key={account.accountId} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  account.platform === 'google' ? 'bg-red-100 text-red-600' :
                  account.platform === 'microsoft' ? 'bg-blue-100 text-blue-600' :
                  account.platform === 'github' ? 'bg-gray-100 text-gray-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  <span className="font-bold text-lg">
                    {account.platform.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 capitalize">{account.platform}</div>
                  <div className="text-sm text-gray-500 truncate">{account.email || 'Connected'}</div>
                  {account.lastScannedAt && (
                    <div className="text-xs text-gray-400 mt-1">
                      Last scan: {new Date(account.lastScannedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleScan(account.accountId)}
                  disabled={scanning === account.accountId}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning === account.accountId ? 'animate-spin' : ''}`} />
                  {scanning === account.accountId ? 'Scanning...' : 'Scan'}
                </button>
                <button
                  onClick={() => handleDelete(account.accountId)}
                  className="flex items-center justify-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:w-96 sm:rounded-xl rounded-t-xl p-4 animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Connect Account</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2">
              {PLATFORMS.map(platform => (
                <button
                  key={platform.id}
                  onClick={() => handleConnect(platform.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className={`w-10 h-10 ${platform.color} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-bold">
                      {platform.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{platform.name}</div>
                    <div className="text-sm text-gray-500">{platform.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">
              We only request read-only access to list connected apps.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
