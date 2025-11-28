import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import './AdminLayout.css';

function AdminLayout() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-logo">
          <h2>Complens.ai</h2>
          <p>Admin Panel</p>
        </div>

        <nav className="admin-nav">
          <Link
            to="/admin"
            className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
          >
            <span className="nav-icon">📊</span>
            Dashboard
          </Link>

          <Link
            to="/admin/oauth"
            className={`nav-item ${isActive('/admin/oauth') ? 'active' : ''}`}
          >
            <span className="nav-icon">🔐</span>
            Google Workspace
          </Link>

          <div className="nav-section-title">Coming Soon</div>

          <div className="nav-item disabled">
            <span className="nav-icon">⚙️</span>
            SAML Settings
          </div>

          <div className="nav-item disabled">
            <span className="nav-icon">🔔</span>
            Event Notifications
          </div>

          <div className="nav-item disabled">
            <span className="nav-icon">👥</span>
            User Management
          </div>
        </nav>

        <div className="admin-footer">
          <Link to="/" className="back-to-chat">
            ← Back to Chat
          </Link>
        </div>
      </aside>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
