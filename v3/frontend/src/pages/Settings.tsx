import { useState } from 'react';
import { Bell, RefreshCw, Shield, Info } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { db } from '../services/db';

export default function Settings() {
  const { profile, refreshData } = useAppStore();
  const [saving, setSaving] = useState(false);

  const settings = profile?.settings || {
    notifications: true,
    autoScan: false,
  };

  async function updateSetting(key: 'notifications' | 'autoScan', value: boolean) {
    const newSettings = { ...settings, [key]: value };
    setSaving(true);
    try {
      await db.saveProfile({
        ...profile,
        settings: newSettings,
      });
      await refreshData();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm">Manage your preferences</p>
      </div>

      {/* Settings list */}
      <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
        {/* Notifications */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center">
              <Bell className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Notifications</div>
              <div className="text-sm text-gray-500">Get alerts for new risks</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notifications ?? true}
              onChange={(e) => updateSetting('notifications', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        {/* Auto scan */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Auto-scan</div>
              <div className="text-sm text-gray-500">Scan accounts weekly</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoScan ?? false}
              onChange={(e) => updateSetting('autoScan', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>
      </div>

      {/* Privacy info */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-brand-900">Your data stays on your device</h3>
            <p className="text-brand-700 text-sm mt-1">
              All data is stored locally on your device. We never upload your information to the cloud.
            </p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <Info className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">About Complens</div>
            <div className="text-sm text-gray-500">Version 1.0.0</div>
          </div>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            Complens helps you understand and manage which third-party apps have access to your personal accounts.
          </p>
          <p>
            Connect your Google account to discover apps with access to your data.
          </p>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4">
          <a href="#" className="text-brand-600 text-sm font-medium hover:underline">Privacy Policy</a>
          <a href="#" className="text-brand-600 text-sm font-medium hover:underline">Terms of Service</a>
          <a href="#" className="text-brand-600 text-sm font-medium hover:underline">Contact</a>
        </div>
      </div>

      {saving && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full text-sm">
          Saving...
        </div>
      )}
    </div>
  );
}
