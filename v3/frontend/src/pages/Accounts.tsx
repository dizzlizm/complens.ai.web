import { useState } from 'react';
import { Plus, Trash2, RefreshCw, X } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { googleService } from '../services/google';

const PLATFORMS = [
  { id: 'google', name: 'Google', color: 'bg-red-500', description: 'Gmail, Drive, Calendar, etc.' },
  { id: 'microsoft', name: 'Microsoft', color: 'bg-blue-500', description: 'Outlook, OneDrive, Teams, etc.', disabled: true },
  { id: 'github', name: 'GitHub', color: 'bg-gray-800', description: 'Repositories, Actions, Packages', disabled: true },
];

export default function Accounts() {
  const { accounts, isScanning, scanAccount, removeAccount, signInWithGoogle } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);

  async function handleConnect(platform: string) {
    if (platform === 'google') {
      // For Google, use the same sign-in flow which adds an account
      try {
        await signInWithGoogle();
        setShowModal(false);
      } catch (err) {
        console.error('Failed to connect Google account:', err);
      }
    } else {
      // Other platforms not yet implemented
      alert(`${platform} integration coming soon!`);
    }
    setShowModal(false);
  }

  async function handleScan(accountId: string) {
    setScanningId(accountId);
    try {
      await scanAccount(accountId);
    } finally {
      setScanningId(null);
    }
  }

  async function handleDelete(accountId: string) {
    if (!confirm('Remove this account? This will also remove all discovered apps.')) return;
    try {
      await removeAccount(accountId);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleManagePermissions() {
    await googleService.openPermissionsPage();
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
            <div key={account.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  account.platform === 'google' ? 'bg-red-100 text-red-600' :
                  account.platform === 'microsoft' ? 'bg-blue-100 text-blue-600' :
                  account.platform === 'github' ? 'bg-gray-100 text-gray-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {account.picture ? (
                    <img src={account.picture} alt="" className="w-12 h-12 rounded-full" />
                  ) : (
                    <span className="font-bold text-lg">
                      {account.platform.charAt(0).toUpperCase()}
                    </span>
                  )}
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
                  onClick={() => handleScan(account.id)}
                  disabled={isScanning || scanningId === account.id}
                  className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${scanningId === account.id ? 'animate-spin' : ''}`} />
                  {scanningId === account.id ? 'Scanning...' : 'Scan'}
                </button>
                <button
                  onClick={handleManagePermissions}
                  className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                >
                  Manage
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="flex items-center justify-center gap-2 bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
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
                  disabled={platform.disabled}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                    platform.disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 ${platform.color} rounded-full flex items-center justify-center`}>
                    <span className="text-white font-bold">
                      {platform.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {platform.name}
                      {platform.disabled && <span className="text-xs text-gray-400 ml-2">(Coming soon)</span>}
                    </div>
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
