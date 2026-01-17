import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { Link } from "react-router-dom";

interface Account {
  id: string;
  platform: string;
  email: string;
  last_scanned: string | null;
}

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

interface Scan {
  id: string;
  account_id: string;
  total_apps: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  scanned_at: string;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentApps, setRecentApps] = useState<App[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [accts, apps] = await Promise.all([
        invoke<Account[]>("get_accounts"),
        invoke<App[]>("get_apps", { accountId: null }),
      ]);
      setAccounts(accts);
      setRecentApps(apps.slice(0, 5));

      // Load recent scans for each account
      const scans: Scan[] = [];
      for (const acct of accts.slice(0, 3)) {
        try {
          const acctScans = await invoke<Scan[]>("get_scans", { accountId: acct.id });
          scans.push(...acctScans.slice(0, 2));
        } catch (e) {
          console.error("Failed to load scans for", acct.id, e);
        }
      }
      setRecentScans(scans.sort((a, b) =>
        new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()
      ).slice(0, 5));
    } catch (e) {
      console.error("Failed to load dashboard:", e);
    } finally {
      setLoading(false);
    }
  }

  const highRiskApps = recentApps.filter(a => a.risk_level === "high");
  const totalApps = recentApps.length;

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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your connected accounts and OAuth apps</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Connected Accounts"
          value={accounts.length}
          color="blue"
        />
        <StatCard
          label="Total Apps"
          value={totalApps}
          color="gray"
        />
        <StatCard
          label="High Risk Apps"
          value={highRiskApps.length}
          color="red"
        />
        <StatCard
          label="Last Scan"
          value={recentScans[0] ? formatRelativeTime(recentScans[0].scanned_at) : "Never"}
          isText
          color="green"
        />
      </div>

      {/* Quick Actions */}
      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Get Started</h2>
          <p className="text-gray-500 mb-4">
            Connect your first account to start scanning for OAuth apps.
          </p>
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span>+</span>
            <span>Connect Account</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Recent High Risk Apps */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">High Risk Apps</h2>
              <Link to="/apps" className="text-sm text-blue-600 hover:underline">
                View all
              </Link>
            </div>
            {highRiskApps.length === 0 ? (
              <p className="text-gray-500 text-sm">No high risk apps detected</p>
            ) : (
              <ul className="space-y-3">
                {highRiskApps.slice(0, 3).map((app) => (
                  <li key={app.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{app.name}</div>
                      <div className="text-sm text-gray-500">{app.permissions.length} permissions</div>
                    </div>
                    <RiskBadge level={app.risk_level} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Connected Accounts */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Connected Accounts</h2>
              <Link to="/accounts" className="text-sm text-blue-600 hover:underline">
                Manage
              </Link>
            </div>
            <ul className="space-y-3">
              {accounts.slice(0, 4).map((account) => (
                <li key={account.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={account.platform} />
                    <div>
                      <div className="font-medium text-gray-900">{account.email}</div>
                      <div className="text-sm text-gray-500 capitalize">{account.platform}</div>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {account.last_scanned ? formatRelativeTime(account.last_scanned) : "Not scanned"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentScans.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Scans</h2>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Account</th>
                <th className="pb-3 font-medium">Apps Found</th>
                <th className="pb-3 font-medium">High Risk</th>
                <th className="pb-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentScans.map((scan) => {
                const account = accounts.find(a => a.id === scan.account_id);
                return (
                  <tr key={scan.id} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {account && <PlatformIcon platform={account.platform} size="sm" />}
                        <span>{account?.email || "Unknown"}</span>
                      </div>
                    </td>
                    <td className="py-3">{scan.total_apps}</td>
                    <td className="py-3">
                      <span className={scan.high_risk > 0 ? "text-red-600 font-medium" : "text-gray-500"}>
                        {scan.high_risk}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500">{formatRelativeTime(scan.scanned_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, isText }: { label: string; value: number | string; color: string; isText?: boolean }) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    green: "bg-green-50 text-green-700",
    gray: "bg-gray-50 text-gray-700",
  };

  return (
    <div className={`rounded-xl p-6 ${colorClasses[color]}`}>
      <div className={`${isText ? "text-xl" : "text-3xl"} font-bold mb-1`}>{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-green-100 text-green-700",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[level] || colors.low}`}>
      {level}
    </span>
  );
}

function PlatformIcon({ platform, size = "md" }: { platform: string; size?: "sm" | "md" }) {
  const icons: Record<string, string> = {
    google: "🔵",
    microsoft: "🟦",
    github: "⚫",
    slack: "🟣",
    notion: "⬛",
  };

  const sizeClasses = size === "sm" ? "text-sm" : "text-xl";

  return <span className={sizeClasses}>{icons[platform] || "🔘"}</span>;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
