import React, { useState, useEffect } from 'react';
import { getOAuthStatus, getHealth } from '../../services/api';
import './Dashboard.css';

function Dashboard() {
  const [oauthStatus, setOauthStatus] = useState(null);
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // For now, hardcode orgId = 1, later this will come from auth context
      const [oauth, health] = await Promise.all([
        getOAuthStatus(1).catch(err => ({ error: err.message })),
        getHealth().catch(err => ({ error: err.message }))
      ]);

      setOauthStatus(oauth);
      setHealthStatus(health);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard">
        <h1>Dashboard</h1>
        <div className="loading">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      <p className="subtitle">System Status Overview</p>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="dashboard-grid">
        {/* API Health Status */}
        <div className="status-card">
          <div className="card-header">
            <h3>API Health</h3>
            <span className="status-badge status-success">
              {healthStatus?.status === 'healthy' ? '✓ Healthy' : '⚠ Unknown'}
            </span>
          </div>
          <div className="card-body">
            {healthStatus?.error ? (
              <p className="text-error">{healthStatus.error}</p>
            ) : (
              <>
                <p><strong>Status:</strong> {healthStatus?.status || 'Unknown'}</p>
                <p><strong>Timestamp:</strong> {healthStatus?.timestamp ? new Date(healthStatus.timestamp).toLocaleString() : 'N/A'}</p>
              </>
            )}
          </div>
        </div>

        {/* Google Workspace OAuth Status */}
        <div className="status-card">
          <div className="card-header">
            <h3>Google Workspace</h3>
            <span className={`status-badge ${oauthStatus?.connected ? 'status-success' : 'status-warning'}`}>
              {oauthStatus?.connected ? '✓ Connected' : '○ Not Connected'}
            </span>
          </div>
          <div className="card-body">
            {oauthStatus?.error ? (
              <p className="text-error">{oauthStatus.error}</p>
            ) : oauthStatus?.connected ? (
              <>
                <p><strong>Email:</strong> {oauthStatus.email}</p>
                <p><strong>Connected:</strong> {new Date(oauthStatus.connectedAt).toLocaleDateString()}</p>
                {oauthStatus.tokenExpiry && (
                  <p><strong>Token Expires:</strong> {new Date(oauthStatus.tokenExpiry).toLocaleDateString()}</p>
                )}
              </>
            ) : (
              <p>No Google Workspace account connected. Visit the Google Workspace page to connect.</p>
            )}
          </div>
        </div>

        {/* Placeholder Cards for Future Features */}
        <div className="status-card disabled">
          <div className="card-header">
            <h3>SAML Configuration</h3>
            <span className="status-badge status-disabled">Coming Soon</span>
          </div>
          <div className="card-body">
            <p>SAML single sign-on configuration will be available soon.</p>
          </div>
        </div>

        <div className="status-card disabled">
          <div className="card-header">
            <h3>Event Notifications</h3>
            <span className="status-badge status-disabled">Coming Soon</span>
          </div>
          <div className="card-body">
            <p>Configure webhooks and event notifications for security alerts.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
