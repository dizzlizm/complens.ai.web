import React, { useState, useEffect } from 'react';
import { getOAuthStatus, disconnectOAuth } from '../../services/api';
import './OAuth.css';

function OAuth() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // For now, hardcode orgId = 1, later this will come from auth context
  const orgId = 1;

  useEffect(() => {
    loadOAuthStatus();
  }, []);

  const loadOAuthStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getOAuthStatus(orgId);
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Failed to load OAuth status');
      console.error('OAuth status error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = () => {
    // Redirect to backend OAuth authorization endpoint
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    window.location.href = `${apiUrl}/oauth/google/authorize?orgId=${orgId}`;
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Google Workspace account?')) {
      return;
    }

    setDisconnecting(true);
    setError(null);

    try {
      await disconnectOAuth(orgId);
      await loadOAuthStatus(); // Reload status
    } catch (err) {
      setError(err.message || 'Failed to disconnect');
      console.error('Disconnect error:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="oauth-page">
        <h1>Google Workspace Integration</h1>
        <div className="loading">Loading OAuth status...</div>
      </div>
    );
  }

  return (
    <div className="oauth-page">
      <h1>Google Workspace Integration</h1>
      <p className="subtitle">Connect your Google Workspace account to enable security analysis</p>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="oauth-container">
        {status?.connected ? (
          <div className="oauth-card connected">
            <div className="oauth-status">
              <div className="status-icon success">✓</div>
              <div className="status-text">
                <h2>Connected</h2>
                <p>Your Google Workspace account is connected</p>
              </div>
            </div>

            <div className="oauth-details">
              <div className="detail-row">
                <span className="detail-label">Email:</span>
                <span className="detail-value">{status.email}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Connected:</span>
                <span className="detail-value">
                  {new Date(status.connectedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {status.tokenExpiry && (
                <div className="detail-row">
                  <span className="detail-label">Token Expires:</span>
                  <span className="detail-value">
                    {new Date(status.tokenExpiry).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="oauth-actions">
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="btn btn-danger"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
              </button>
            </div>

            <div className="oauth-info">
              <h3>Permissions Granted</h3>
              <ul>
                <li>Read user directory information</li>
                <li>Read group information</li>
                <li>Read audit logs</li>
                <li>Read Drive files metadata</li>
                <li>Access basic profile information</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="oauth-card disconnected">
            <div className="oauth-status">
              <div className="status-icon warning">○</div>
              <div className="status-text">
                <h2>Not Connected</h2>
                <p>Connect your Google Workspace account to get started</p>
              </div>
            </div>

            <div className="oauth-info">
              <h3>What you'll get:</h3>
              <ul>
                <li><strong>Security Analysis:</strong> Identify potential security risks in your workspace</li>
                <li><strong>User Monitoring:</strong> Track user access and permissions</li>
                <li><strong>File Sharing:</strong> Monitor externally shared files and folders</li>
                <li><strong>Audit Logs:</strong> Review admin and user activity</li>
                <li><strong>Extension Management:</strong> Track Chrome Web Store extensions</li>
              </ul>

              <h3>Required Permissions:</h3>
              <ul>
                <li>Read-only access to user directory</li>
                <li>Read-only access to groups</li>
                <li>Read-only access to audit reports</li>
                <li>Read-only access to Drive metadata</li>
              </ul>
            </div>

            <div className="oauth-actions">
              <button onClick={handleConnect} className="btn btn-primary">
                Connect Google Workspace
              </button>
            </div>

            <div className="oauth-note">
              <p>
                <strong>Note:</strong> You'll be redirected to Google to authorize access.
                Complens.ai only requests read-only permissions and never modifies your data.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OAuth;
