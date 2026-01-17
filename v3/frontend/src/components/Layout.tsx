import { Outlet, NavLink } from 'react-router-dom';
import { Home, Link2, Grid, Settings, LogOut, Shield } from 'lucide-react';
import { useAppStore } from '../stores/appStore';

export default function Layout() {
  const { profile, signOut, stats } = useAppStore();

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/accounts', icon: Link2, label: 'Accounts' },
    { to: '/apps', icon: Grid, label: 'Apps', badge: stats.appCount || undefined },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900">Complens</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Risk indicator */}
          {stats.highRisk > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              {stats.highRisk} risk{stats.highRisk !== 1 ? 's' : ''}
            </div>
          )}

          {/* User avatar */}
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-600 text-sm font-medium">
                {profile?.name?.charAt(0) || '?'}
              </span>
            </div>
          )}

          <button
            onClick={signOut}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Sign out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar scroll-touch">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bg-white border-t border-gray-200 px-2 py-2 safe-area-bottom">
        <div className="flex justify-around items-center max-w-md mx-auto">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-150 ${
                  isActive
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-400 active:bg-gray-100'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-600 text-white text-xs rounded-full flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
