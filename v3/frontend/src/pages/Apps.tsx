import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, AlertTriangle, AlertCircle, CheckCircle, ExternalLink, Filter } from 'lucide-react';
import { api } from '../services/api';

interface App {
  appId: string;
  name: string;
  platform: string;
  accountId: string;
  riskLevel: 'high' | 'medium' | 'low';
  permissions: string[];
  lastAccessed?: string;
  discoveredAt: string;
}

export default function Apps() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(searchParams.get('risk') || 'all');

  useEffect(() => {
    loadApps();
  }, []);

  async function loadApps() {
    try {
      const res = await api.getApps();
      setApps(res.apps);
    } catch (err) {
      console.error('Failed to load apps:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredApps = filter === 'all'
    ? apps
    : apps.filter(app => app.riskLevel === filter);

  const counts = {
    all: apps.length,
    high: apps.filter(a => a.riskLevel === 'high').length,
    medium: apps.filter(a => a.riskLevel === 'medium').length,
    low: apps.filter(a => a.riskLevel === 'low').length,
  };

  function getRiskBadge(level: string) {
    switch (level) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <AlertTriangle className="w-3 h-3" /> High
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <AlertCircle className="w-3 h-3" /> Medium
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" /> Low
          </span>
        );
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
      <div>
        <h1 className="text-xl font-bold text-gray-900">Discovered Apps</h1>
        <p className="text-gray-500 text-sm">Third-party apps with access to your accounts</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2">
        {[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'high', label: 'High Risk', count: counts.high },
          { key: 'medium', label: 'Medium', count: counts.medium },
          { key: 'low', label: 'Low', count: counts.low },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => {
              setFilter(key);
              setSearchParams(key === 'all' ? {} : { risk: key });
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              filter === key ? 'bg-white/20' : 'bg-gray-200'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Apps list */}
      {apps.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
          <div className="text-gray-400 mb-4">
            <Shield className="w-12 h-12 mx-auto" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No apps discovered yet</h2>
          <p className="text-gray-500 text-sm">
            Connect an account and run a scan to discover third-party apps.
          </p>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
          <div className="text-gray-400 mb-4">
            <Filter className="w-12 h-12 mx-auto" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">No {filter} risk apps</h2>
          <p className="text-gray-500 text-sm">
            Great! No apps match this filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApps.map(app => (
            <div key={app.appId} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-600 font-semibold">
                      {app.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{app.name}</div>
                    <div className="text-sm text-gray-500 capitalize">{app.platform}</div>
                  </div>
                </div>
                {getRiskBadge(app.riskLevel)}
              </div>

              {app.permissions && app.permissions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">Permissions:</div>
                  <div className="flex flex-wrap gap-1">
                    {app.permissions.slice(0, 5).map((perm, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                        {perm}
                      </span>
                    ))}
                    {app.permissions.length > 5 && (
                      <span className="px-2 py-0.5 text-gray-400 text-xs">
                        +{app.permissions.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="text-xs text-gray-400">
                  Discovered {new Date(app.discoveredAt).toLocaleDateString()}
                </div>
                <button className="flex items-center gap-1 text-brand-600 text-sm font-medium hover:underline">
                  Manage <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
