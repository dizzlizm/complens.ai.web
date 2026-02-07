import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import AcceptInvite from './pages/auth/AcceptInvite';

// App pages
import Dashboard from './pages/Dashboard';
import Workflows from './pages/Workflows';
import WorkflowEditor from './pages/WorkflowEditor';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Pages from './pages/Pages';
import PageEditor from './pages/PageEditor';
import BusinessProfile from './pages/BusinessProfile';
// Forms removed - now managed inside Page Editor
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

// Admin pages
import {
  AdminWorkspaces,
  AdminWorkspaceDetail,
  AdminUsers,
  AdminUserDetail,
  AdminBilling,
  AdminCosts,
  AdminSystem,
} from './pages/admin';

// Public pages (no auth)
import PublicPage from './pages/public/PublicPage';

// Error boundary
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <ErrorBoundary>
        <Routes>
          {/* Auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>

          {/* Protected app routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/:id" element={<WorkflowEditor />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />
            <Route path="/pages" element={<Pages />} />
            <Route path="/pages/:id" element={<PageEditor />} />
            {/* Forms routes removed - forms are now managed inside Page Editor */}
            <Route path="/business-profile" element={<BusinessProfile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          {/* Accept invitation (handles both auth states internally) */}
          <Route path="/accept-invite" element={<AcceptInvite />} />

          {/* Admin routes (super admin only) */}
          <Route
            element={
              <AdminProtectedRoute>
                <AdminLayout />
              </AdminProtectedRoute>
            }
          >
            <Route path="/admin" element={<Navigate to="/admin/workspaces" replace />} />
            <Route path="/admin/workspaces" element={<AdminWorkspaces />} />
            <Route path="/admin/workspaces/:id" element={<AdminWorkspaceDetail />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/costs" element={<AdminCosts />} />
            <Route path="/admin/system" element={<AdminSystem />} />
          </Route>

          {/* Public pages (no auth required) */}
          <Route path="/p/:pageSlug" element={<PublicPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
