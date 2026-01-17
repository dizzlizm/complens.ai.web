import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, CheckCircle, Plus, ArrowRight } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

export default function Dashboard() {
  const { accounts, stats } = useAppStore();

  const { highRisk, mediumRisk } = stats;

  return (
    <div className="p-4 space-y-6">
      {/* Welcome */}
      <div className="text-center py-4">
        <h1 className="text-2xl font-bold text-gray-900">Your Privacy Dashboard</h1>
        <p className="text-gray-500 mt-1">See who has access to your data</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{stats.accountCount}</div>
          <div className="text-xs text-gray-500 mt-1">Accounts</div>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{stats.appCount}</div>
          <div className="text-xs text-gray-500 mt-1">Apps</div>
        </div>
        <div className={`rounded-xl p-4 text-center shadow-sm ${
          highRisk > 0 ? 'bg-red-50' : 'bg-green-50'
        }`}>
          <div className={`text-2xl font-bold ${highRisk > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {highRisk}
          </div>
          <div className={`text-xs mt-1 ${highRisk > 0 ? 'text-red-500' : 'text-green-500'}`}>
            High Risk
          </div>
        </div>
      </div>

      {/* No accounts state */}
      {accounts.length === 0 ? (
        <div className="bg-white rounded-xl p-6 text-center shadow-sm">
          <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-brand-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Connect your first account
          </h2>
          <p className="text-gray-500 text-sm mb-4">
            Link your Google, Microsoft, or GitHub account to see what apps have access to your data.
          </p>
          <Link
            to="/accounts"
            className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Connect Account
          </Link>
        </div>
      ) : (
        <>
          {/* Risk summary */}
          {highRisk > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800">
                    {highRisk} high-risk app{highRisk !== 1 ? 's' : ''} detected
                  </h3>
                  <p className="text-red-600 text-sm mt-1">
                    These apps have extensive access to your data. Review and revoke if needed.
                  </p>
                  <Link
                    to="/apps?risk=high"
                    className="inline-flex items-center gap-1 text-red-700 font-medium text-sm mt-2 hover:underline"
                  >
                    Review now <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {highRisk === 0 && mediumRisk === 0 && stats.appCount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-800">Looking good!</h3>
                  <p className="text-green-600 text-sm mt-1">
                    No high-risk apps found. Keep monitoring your connected accounts.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Connected accounts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Connected Accounts</h2>
              <Link to="/accounts" className="text-brand-600 text-sm font-medium">
                Manage
              </Link>
            </div>
            <div className="space-y-2">
              {accounts.slice(0, 3).map(account => (
                <div key={account.id} className="bg-white rounded-lg p-3 flex items-center gap-3 shadow-sm">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    account.platform === 'google' ? 'bg-red-100' :
                    account.platform === 'microsoft' ? 'bg-blue-100' :
                    'bg-gray-100'
                  }`}>
                    <span className="font-semibold text-sm">
                      {account.platform.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 capitalize">{account.platform}</div>
                    <div className="text-sm text-gray-500 truncate">{account.email || 'Connected'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Ask AI prompt */}
      <Link
        to="/chat"
        className="block bg-gradient-to-r from-brand-500 to-brand-600 rounded-xl p-4 text-white shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-lg">AI</span>
          </div>
          <div className="flex-1">
            <div className="font-semibold">Ask Complens AI</div>
            <div className="text-white/80 text-sm">Get privacy advice and recommendations</div>
          </div>
          <ArrowRight className="w-5 h-5" />
        </div>
      </Link>
    </div>
  );
}
