import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useCurrentWorkspace } from '@/lib/hooks/useWorkspaces';
import {
  LayoutDashboard,
  GitBranch,
  Users,
  FileText,
  Flame,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  ChevronsUpDown,
  Check,
  Building2,
  Shield,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

// Navigation items - Forms removed (now managed inside Page Editor)
// AI Profile also removed - profiles are now per-page
const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Workflows', href: '/workflows', icon: GitBranch },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Pages', href: '/pages', icon: FileText },
  { name: 'Email Warmup', href: '/email-warmup', icon: Flame },
  { name: 'Settings', href: '/settings', icon: Settings },
];

function WorkspaceSwitcher() {
  const { workspace, workspaces, setCurrentWorkspaceId } = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!workspaces || workspaces.length <= 1) {
    // Single workspace - just show the name, no dropdown
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700 truncate">
          {workspace?.name || 'Workspace'}
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">
          {workspace?.name || 'Workspace'}
        </span>
        <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-60 overflow-auto">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                setCurrentWorkspaceId(ws.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
            >
              <span className="flex-1 truncate text-gray-700">{ws.name}</span>
              {ws.id === workspace?.id && (
                <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <span className="text-xl font-bold text-primary-600">Complens.ai</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="px-2 pt-3 pb-1 border-b border-gray-100">
          <WorkspaceSwitcher />
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
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
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
        <div className="flex flex-col flex-1 bg-white border-r border-gray-200">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <span className="text-xl font-bold text-primary-600">Complens.ai</span>
          </div>

          {/* Workspace switcher */}
          <div className="px-3 pt-3 pb-1 border-b border-gray-100">
            <WorkspaceSwitcher />
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
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

          {/* Admin link (super admin only) */}
          {user?.isSuperAdmin && (
            <div className="px-4 py-2 border-t border-gray-200">
              <Link
                to="/admin"
                className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Shield className="w-5 h-5" />
                <span className="font-medium">Admin Panel</span>
              </Link>
            </div>
          )}

          {/* User section */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                <User className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.name || user?.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to="/profile"
                className="flex-1 btn btn-secondary text-sm text-center"
              >
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center h-16 px-4 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 lg:hidden"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1" />
          {/* Add breadcrumbs or page title here later */}
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
