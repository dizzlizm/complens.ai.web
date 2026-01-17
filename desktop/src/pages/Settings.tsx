import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

interface Settings {
  auto_scan_enabled: boolean;
  scan_interval_hours: number;
  notifications_enabled: boolean;
  theme: string;
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({
    auto_scan_enabled: false,
    scan_interval_hours: 24,
    notifications_enabled: true,
    theme: "system",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await invoke<Settings>("get_settings");
      setSettings(data);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage(null);
      await invoke("update_settings", { settings });
      setMessage({ type: "success", text: "Settings saved successfully" });
    } catch (e: any) {
      console.error("Failed to save settings:", e);
      setMessage({ type: "error", text: `Failed to save: ${e}` });
    } finally {
      setSaving(false);
    }
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure your Complens preferences</p>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg mb-6 ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-8">
        {/* Scanning Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scanning</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">Automatic Scanning</div>
                <div className="text-sm text-gray-500">
                  Periodically scan accounts for new OAuth apps
                </div>
              </div>
              <Toggle
                enabled={settings.auto_scan_enabled}
                onChange={(enabled) => updateSetting("auto_scan_enabled", enabled)}
              />
            </div>

            {settings.auto_scan_enabled && (
              <div>
                <label className="block font-medium text-gray-900 mb-2">Scan Interval</label>
                <select
                  value={settings.scan_interval_hours}
                  onChange={(e) => updateSetting("scan_interval_hours", parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                >
                  <option value={6}>Every 6 hours</option>
                  <option value={12}>Every 12 hours</option>
                  <option value={24}>Every 24 hours</option>
                  <option value={48}>Every 2 days</option>
                  <option value={168}>Weekly</option>
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h2>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">Desktop Notifications</div>
              <div className="text-sm text-gray-500">
                Get notified when new high-risk apps are detected
              </div>
            </div>
            <Toggle
              enabled={settings.notifications_enabled}
              onChange={(enabled) => updateSetting("notifications_enabled", enabled)}
            />
          </div>
        </section>

        {/* Appearance Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Appearance</h2>

          <div>
            <label className="block font-medium text-gray-900 mb-2">Theme</label>
            <div className="flex gap-3">
              {[
                { id: "system", label: "System" },
                { id: "light", label: "Light" },
                { id: "dark", label: "Dark" },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => updateSetting("theme", option.id)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    settings.theme === option.id
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Data Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Data & Privacy</h2>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="font-medium text-gray-900 mb-1">Local Storage</div>
              <div className="text-sm text-gray-500">
                All your data is stored locally on this device. We never send your data to external
                servers.
              </div>
            </div>

            <button
              onClick={() => {
                if (confirm("Are you sure you want to clear all scan history?")) {
                  // TODO: Implement clear history
                }
              }}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Clear Scan History
            </button>

            <button
              onClick={() => {
                if (
                  confirm(
                    "Are you sure you want to reset all data? This will remove all accounts and settings."
                  )
                ) {
                  // TODO: Implement reset
                }
              }}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Reset All Data
            </button>
          </div>
        </section>

        {/* About Section */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">About</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Version</span>
              <span className="text-gray-900">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Website</span>
              <a href="https://complens.ai" className="text-blue-600 hover:underline">
                complens.ai
              </a>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        enabled ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : ""
        }`}
      />
    </button>
  );
}
