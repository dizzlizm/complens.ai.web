import { Outlet, NavLink } from 'react-router-dom';
import { Home, Link, Grid, MessageCircle, Settings, LogOut } from 'lucide-react';
import type { AuthUser } from 'aws-amplify/auth';

interface LayoutProps {
  user: AuthUser | undefined;
  signOut: (() => void) | undefined;
}

export default function Layout({ user, signOut }: LayoutProps) {
  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/accounts', icon: Link, label: 'Accounts' },
    { to: '/apps', icon: Grid, label: 'Apps' },
    { to: '/chat', icon: MessageCircle, label: 'Ask AI' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <span className="font-semibold text-gray-900">Complens</span>
        </div>
        <button
          onClick={signOut}
          className="text-gray-500 hover:text-gray-700 p-2"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto hide-scrollbar">
        <Outlet />
      </main>

      {/* Bottom navigation - mobile first */}
      <nav className="bg-white border-t border-gray-200 px-2 py-2 safe-area-bottom">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-brand-600 bg-brand-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
