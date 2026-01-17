import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface Account {
  id: string;
  platform: string;
  email: string;
  created_at: string;
  last_scanned: string | null;
}

const PLATFORMS = [
  { id: "google", name: "Google", icon: "🔵", description: "Gmail, Drive, Calendar" },
  { id: "microsoft", name: "Microsoft", icon: "🟦", description: "Outlook, OneDrive, Teams" },
  { id: "github", name: "GitHub", icon: "⚫", description: "Repositories, Actions" },
  { id: "slack", name: "Slack", icon: "🟣", description: "Workspaces, Apps", disabled: true },
  { id: "notion", name: "Notion", icon: "⬛", description: "Pages, Databases", disabled: true },
];

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const data = await invoke<Account[]>("get_accounts");
      setAccounts(data);
    } catch (e) {
      console.error("Failed to load accounts:", e);
      setError("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAccount(platform: string) {
    try {
      setError(null);
      await invoke("add_account", { platform });
      setShowAddModal(false);
      await loadAccounts();
    } catch (e: any) {
      console.error("Failed to add account:", e);
      setError(e.toString());
    }
  }

  async function handleScan(accountId: string) {
    try {
      setScanning(accountId);
      setError(null);
      await invoke("scan_account", { accountId });
      await loadAccounts();
    } catch (e: any) {
      console.error("Failed to scan:", e);
      setError(e.toString());
    } finally {
      setScanning(null);
    }
  }

  async function handleRemove(accountId: string) {
    if (!confirm("Are you sure you want to remove this account?")) return;

    try {
      await invoke("remove_account", { accountId });
      await loadAccounts();
    } catch (e: any) {
      console.error("Failed to remove account:", e);
      setError(e.toString());
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connected Accounts</h1>
          <p className="text-gray-500">Manage your connected cloud accounts</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span>+</span>
          <span>Add Account</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No accounts connected</h2>
          <p className="text-gray-500 mb-6">
            Connect your first account to start scanning for OAuth apps.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span>+</span>
            <span>Connect Account</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="text-3xl">
                  {PLATFORMS.find(p => p.id === account.platform)?.icon || "🔘"}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{account.email}</div>
                  <div className="text-sm text-gray-500 capitalize">{account.platform}</div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm text-gray-500">Last Scanned</div>
                  <div className="font-medium">
                    {account.last_scanned
                      ? new Date(account.last_scanned).toLocaleDateString()
                      : "Never"}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleScan(account.id)}
                    disabled={scanning === account.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {scanning === account.id ? "Scanning..." : "Scan"}
                  </button>
                  <button
                    onClick={() => handleRemove(account.id)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Connect Account</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="text-gray-500 mb-6">
              Select a platform to connect. You'll be redirected to authorize access.
            </p>

            <div className="space-y-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => !platform.disabled && handleAddAccount(platform.id)}
                  disabled={platform.disabled}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-colors text-left ${
                    platform.disabled
                      ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  <span className="text-2xl">{platform.icon}</span>
                  <div>
                    <div className="font-medium text-gray-900">
                      {platform.name}
                      {platform.disabled && (
                        <span className="ml-2 text-xs text-gray-400">(Coming soon)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{platform.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
