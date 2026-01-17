import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface App {
  id: string;
  account_id: string;
  app_id: string;
  name: string;
  publisher: string | null;
  permissions: string[];
  risk_level: string;
  risk_score: number;
  discovered_at: string;
}

interface Account {
  id: string;
  platform: string;
  email: string;
}

export default function Apps() {
  const [apps, setApps] = useState<App[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedAccount]);

  async function loadData() {
    try {
      setLoading(true);
      const [appsData, accountsData] = await Promise.all([
        invoke<App[]>("get_apps", { accountId: selectedAccount }),
        invoke<Account[]>("get_accounts"),
      ]);
      setApps(appsData);
      setAccounts(accountsData);
    } catch (e) {
      console.error("Failed to load apps:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(app: App) {
    if (!confirm(`Are you sure you want to revoke access for "${app.name}"?`)) return;

    try {
      setRevoking(app.id);
      await invoke("revoke_app", { accountId: app.account_id, appId: app.app_id });
      await loadData();
    } catch (e: any) {
      console.error("Failed to revoke:", e);
      alert(`Failed to revoke: ${e}`);
    } finally {
      setRevoking(null);
    }
  }

  const filteredApps = apps.filter((app) => {
    if (filter === "all") return true;
    return app.risk_level === filter;
  });

  const riskCounts = {
    all: apps.length,
    high: apps.filter((a) => a.risk_level === "high").length,
    medium: apps.filter((a) => a.risk_level === "medium").length,
    low: apps.filter((a) => a.risk_level === "low").length,
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">OAuth Apps</h1>
        <p className="text-gray-500">Review apps with access to your accounts</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-2">
          {(["all", "high", "medium", "low"] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === level
                  ? level === "high"
                    ? "bg-red-100 text-red-700"
                    : level === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : level === "low"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)} ({riskCounts[level]})
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <select
          value={selectedAccount || ""}
          onChange={(e) => setSelectedAccount(e.target.value || null)}
          className="px-4 py-2 border border-gray-200 rounded-lg bg-white"
        >
          <option value="">All Accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email}
            </option>
          ))}
        </select>
      </div>

      {/* Apps List */}
      {filteredApps.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📱</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No apps found</h2>
          <p className="text-gray-500">
            {apps.length === 0
              ? "Run a scan on your connected accounts to discover OAuth apps."
              : "No apps match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredApps.map((app) => {
            const account = accounts.find((a) => a.id === app.account_id);
            const isExpanded = expandedApp === app.id;

            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div
                  className="p-6 flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedApp(isExpanded ? null : app.id)}
                >
                  <div className="flex items-center gap-4">
                    <RiskIndicator level={app.risk_level} score={app.risk_score} />
                    <div>
                      <div className="font-semibold text-gray-900">{app.name}</div>
                      <div className="text-sm text-gray-500">
                        {app.publisher || "Unknown publisher"} • {account?.email}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Permissions</div>
                      <div className="font-medium">{app.permissions.length}</div>
                    </div>
                    <div
                      className={`transform transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-6 bg-gray-50">
                    <div className="mb-4">
                      <h3 className="font-medium text-gray-900 mb-2">Permissions</h3>
                      <div className="flex flex-wrap gap-2">
                        {app.permissions.map((perm, i) => (
                          <span
                            key={i}
                            className={`px-3 py-1 rounded-full text-sm ${
                              isHighRiskPermission(perm)
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        Discovered: {new Date(app.discovered_at).toLocaleDateString()}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevoke(app);
                        }}
                        disabled={revoking === app.id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {revoking === app.id ? "Revoking..." : "Revoke Access"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskIndicator({ level, score }: { level: string; score: number }) {
  const colors: Record<string, { bg: string; text: string; ring: string }> = {
    high: { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-500" },
    medium: { bg: "bg-yellow-100", text: "text-yellow-700", ring: "ring-yellow-500" },
    low: { bg: "bg-green-100", text: "text-green-700", ring: "ring-green-500" },
  };

  const color = colors[level] || colors.low;

  return (
    <div
      className={`w-12 h-12 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-bold ring-2 ${color.ring}`}
    >
      {score}
    </div>
  );
}

function isHighRiskPermission(permission: string): boolean {
  const highRiskPatterns = [
    "write",
    "delete",
    "admin",
    "manage",
    "full",
    "all",
    "modify",
    "create",
    "remove",
  ];
  const permLower = permission.toLowerCase();
  return highRiskPatterns.some((pattern) => permLower.includes(pattern));
}
