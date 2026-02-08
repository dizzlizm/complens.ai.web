import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  Building2,
  Users,
  CreditCard,
  Activity,
  DollarSign,
  LogOut,
  Menu,
  X,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { name: 'Workspaces', href: '/admin/workspaces', icon: Building2 },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Billing', href: '/admin/billing', icon: CreditCard },
  { name: 'Costs', href: '/admin/costs', icon: DollarSign },
  { name: 'System', href: '/admin/system', icon: Activity },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            <span className="text-lg font-bold text-red-500">Admin</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-2 text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="mt-4 px-2">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  isActive
                    ? 'bg-red-600/20 text-red-400'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 bg-gray-800 border-r border-gray-700">
          {/* Logo/Header */}
          <div className="flex items-center h-16 px-6 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-red-500" />
              <span className="text-xl font-bold text-red-500">Super Admin</span>
            </div>
          </div>

          {/* Admin warning banner */}
          <div className="px-4 py-2 bg-red-600/10 border-b border-red-600/20">
            <p className="text-xs text-red-400 text-center">
              Platform Administration Mode
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/admin' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-red-600/20 text-red-400 font-medium'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <item.icon className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? '' : 'group-hover:scale-110'
                  }`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Exit Admin / User section */}
          <div className="p-4 border-t border-gray-700">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-3 py-2 mb-3 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Exit Admin</span>
            </Link>

            <div className="flex items-center gap-3 px-3 py-2 text-gray-400">
              <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">
                  {user?.name || user?.email}
                </p>
                <p className="text-xs text-gray-500 truncate">Super Admin</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center h-16 px-4 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700 shadow-sm lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-400 hover:text-white lg:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          {/* Admin mode indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 rounded-full border border-red-600/20">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-red-400">Admin Mode</span>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
