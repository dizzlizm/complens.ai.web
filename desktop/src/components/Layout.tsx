import { Outlet, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface Stats {
  totalAccounts: number;
  totalApps: number;
  highRiskApps: number;
}

export default function Layout() {
  const [stats, setStats] = useState<Stats>({ totalAccounts: 0, totalApps: 0, highRiskApps: 0 });

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const accounts = await invoke<any[]>("get_accounts");
      const apps = await invoke<any[]>("get_apps", { accountId: null });
      setStats({
        totalAccounts: accounts.length,
        totalApps: apps.length,
        highRiskApps: apps.filter((a: any) => a.risk_level === "high").length,
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  const navItems = [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/accounts", label: "Accounts", icon: "🔗" },
    { to: "/apps", label: "Apps", icon: "📱" },
    { to: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Complens</h1>
          <p className="text-sm text-gray-500">OAuth Security Scanner</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Stats Footer */}
        <div className="p-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-semibold text-gray-900">{stats.totalAccounts}</div>
              <div className="text-xs text-gray-500">Accounts</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900">{stats.totalApps}</div>
              <div className="text-xs text-gray-500">Apps</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-red-600">{stats.highRiskApps}</div>
              <div className="text-xs text-gray-500">High Risk</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
