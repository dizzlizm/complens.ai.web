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
import PartnerPipeline from './pages/PartnerPipeline';
import Sites from './pages/Sites';
import Pages from './pages/Pages';
import PageEditor from './pages/PageEditor';
// Forms removed - now managed inside Page Editor
import Conversations from './pages/Conversations';
import Settings from './pages/Settings';
import SiteAISettings from './pages/SiteAISettings';
import SiteEmail from './pages/SiteEmail';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';

// Site-scoped layout
import SiteLayout from './layouts/SiteLayout';

// Admin pages
import {
  AdminDashboard,
  AdminWorkspaces,
  AdminWorkspaceDetail,
  AdminUsers,
  AdminUserDetail,
  AdminBilling,
  AdminCosts,
  AdminPlans,
  AdminSystem,
} from './pages/admin';

// Public pages (no auth)
import PublicPage from './pages/public/PublicPage';
import EmbedChat from './pages/public/EmbedChat';

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
            <Route path="/inbox" element={<Conversations />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/contacts/:id" element={<ContactDetail />} />
            <Route path="/partners" element={<PartnerPipeline />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />

            {/* Site-scoped routes */}
            <Route path="/sites/:siteId" element={<SiteLayout />}>
              <Route path="pages" element={<Pages />} />
              <Route path="pages/:id" element={<PageEditor />} />
              <Route path="workflows" element={<Workflows />} />
              <Route path="workflows/:id" element={<WorkflowEditor />} />
              <Route path="email" element={<SiteEmail />} />
              <Route path="email-warmup" element={<Navigate to="/settings?section=domains" replace />} />
              <Route path="ai" element={<SiteAISettings />} />
            </Route>

            {/* Global fallback routes (backwards compat for direct links) */}
            <Route path="/pages" element={<Pages />} />
            <Route path="/pages/:id" element={<PageEditor />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/:id" element={<WorkflowEditor />} />
            <Route path="/email-warmup" element={<Navigate to="/settings?section=domains" replace />} />
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
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/workspaces" element={<AdminWorkspaces />} />
            <Route path="/admin/workspaces/:id" element={<AdminWorkspaceDetail />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            <Route path="/admin/billing" element={<AdminBilling />} />
            <Route path="/admin/plans" element={<AdminPlans />} />
            <Route path="/admin/costs" element={<AdminCosts />} />
            <Route path="/admin/system" element={<AdminSystem />} />
          </Route>

          {/* Public pages (no auth required) */}
          <Route path="/p/:pageSlug" element={<PublicPage />} />

          {/* Embeddable chat widget (loaded in iframe on external sites) */}
          <Route path="/embed/chat" element={<EmbedChat />} />

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
