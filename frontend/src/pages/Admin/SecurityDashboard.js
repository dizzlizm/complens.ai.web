import React, { useState, useEffect } from 'react';
import {
  getOAuthStatus,
  getSecuritySummary,
  getSecurityPolicies,
  getUsersWithout2FA,
  getAdminAccounts,
  getExternalSharing
} from '../../services/api';
import './SecurityDashboard.css';

function SecurityDashboard() {
  const [oauthStatus, setOauthStatus] = useState(null);
  const [securityData, setSecurityData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    setLoading(true);
    setError(null);

    try {
      // First check OAuth status
      const oauth = await getOAuthStatus().catch(err => ({ error: err.message }));
      setOauthStatus(oauth);

      // Only load security data if Google Workspace is connected
      if (oauth?.connected) {
        const [summary, policies] = await Promise.all([
          getSecuritySummary().catch(err => ({ error: err.message })),
          getSecurityPolicies().catch(err => ({ error: err.message }))
        ]);

        setSecurityData({
          summary,
          policies
        });
      }
    } catch (err) {
      setError('Failed to load security data');
      console.error('Security dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runSecurityScan = async () => {
    setRefreshing(true);
    try {
      // Fetch fresh data by calling the policies endpoint (triggers scan)
      const [summary, policies, users, admins, sharing] = await Promise.all([
        getSecuritySummary(),
        getSecurityPolicies(),
        getUsersWithout2FA(),
        getAdminAccounts(),
        getExternalSharing()
      ]);

      setSecurityData({
        summary,
        policies,
        usersWithout2FA: users,
        adminAccounts: admins,
        externalSharing: sharing
      });
    } catch (err) {
      setError('Failed to run security scan: ' + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#22c55e'; // Green
    if (score >= 60) return '#eab308'; // Yellow
    if (score >= 40) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Needs Improvement';
    return 'Critical';
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="security-dashboard">
        <h1>Security Dashboard</h1>
        <div className="loading">Loading security data...</div>
      </div>
    );
  }

  // Not connected - show connection prompt
  if (!oauthStatus?.connected) {
    return (
      <div className="security-dashboard">
        <h1>Security Dashboard</h1>
        <div className="not-connected-card">
          <div className="not-connected-icon">🔐</div>
          <h2>Google Workspace Not Connected</h2>
          <p>
            Connect your Google Workspace account to enable security scanning.
            This will allow Complens.ai to analyze your organization's security posture.
          </p>
          <a href="/admin/oauth" className="connect-button">
            Connect Google Workspace
          </a>
        </div>
      </div>
    );
  }

  const securityScore = securityData?.policies?.summary?.securityScore ?? 0;
  const findings = securityData?.policies?.findings || [];

  return (
    <div className="security-dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Security Dashboard</h1>
          <p className="subtitle">Google Workspace Security Analysis</p>
        </div>
        <button
          className="scan-button"
          onClick={runSecurityScan}
          disabled={refreshing}
        >
          {refreshing ? 'Scanning...' : 'Run Security Scan'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users & 2FA
        </button>
        <button
          className={`tab-button ${activeTab === 'admins' ? 'active' : ''}`}
          onClick={() => setActiveTab('admins')}
        >
          Admin Accounts
        </button>
        <button
          className={`tab-button ${activeTab === 'sharing' ? 'active' : ''}`}
          onClick={() => setActiveTab('sharing')}
        >
          External Sharing
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="tab-content">
          <div className="overview-grid">
            {/* Security Score Card */}
            <div className="score-card">
              <h3>Security Score</h3>
              <div className="score-gauge">
                <svg viewBox="0 0 120 120">
                  <circle
                    className="score-bg"
                    cx="60" cy="60" r="50"
                    fill="none"
                    strokeWidth="10"
                  />
                  <circle
                    className="score-progress"
                    cx="60" cy="60" r="50"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    style={{
                      stroke: getScoreColor(securityScore),
                      strokeDasharray: `${securityScore * 3.14} 314`,
                      transform: 'rotate(-90deg)',
                      transformOrigin: '50% 50%'
                    }}
                  />
                  <text x="60" y="55" textAnchor="middle" className="score-value">
                    {securityScore}
                  </text>
                  <text x="60" y="75" textAnchor="middle" className="score-label">
                    {getScoreLabel(securityScore)}
                  </text>
                </svg>
              </div>
              <div className="score-details">
                <p>2FA Adoption: {securityData?.policies?.summary?.twoFactorAdoptionRate || '0%'}</p>
                <p>Active Users: {securityData?.policies?.summary?.activeUsers || 0}</p>
                <p>Super Admins: {securityData?.policies?.summary?.superAdminCount || 0}</p>
              </div>
            </div>

            {/* Findings Summary Card */}
            <div className="findings-card">
              <h3>Security Findings</h3>
              <div className="findings-list">
                {findings.length === 0 ? (
                  <p className="no-findings">No security issues detected</p>
                ) : (
                  findings.map((finding, index) => (
                    <div key={index} className="finding-item">
                      <span
                        className="severity-badge"
                        style={{ backgroundColor: getSeverityColor(finding.severity) }}
                      >
                        {finding.severity}
                      </span>
                      <span className="finding-description">{finding.description}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Findings Count by Severity */}
            <div className="summary-card">
              <h3>Findings by Severity</h3>
              {securityData?.summary?.summary?.length > 0 ? (
                <div className="severity-counts">
                  {['critical', 'high', 'medium', 'low'].map(severity => {
                    const count = securityData.summary.summary
                      .filter(s => s.severity === severity)
                      .reduce((sum, s) => sum + parseInt(s.count), 0);
                    return (
                      <div key={severity} className="severity-row">
                        <span
                          className="severity-dot"
                          style={{ backgroundColor: getSeverityColor(severity) }}
                        />
                        <span className="severity-name">{severity}</span>
                        <span className="severity-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="no-data">Run a security scan to see findings</p>
              )}
            </div>

            {/* Recommendations Card */}
            <div className="recommendations-card">
              <h3>Recommendations</h3>
              <ul className="recommendations-list">
                {securityData?.policies?.recommendations?.length > 0 ? (
                  securityData.policies.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))
                ) : (
                  <li className="no-recommendations">
                    No critical recommendations at this time
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Users & 2FA Tab */}
      {activeTab === 'users' && (
        <div className="tab-content">
          <div className="data-card">
            <div className="card-header">
              <h3>Users Without Two-Factor Authentication</h3>
              <button
                className="refresh-button"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const users = await getUsersWithout2FA();
                    setSecurityData(prev => ({ ...prev, usersWithout2FA: users }));
                  } catch (err) {
                    setError('Failed to fetch users: ' + err.message);
                  }
                  setRefreshing(false);
                }}
                disabled={refreshing}
              >
                Refresh
              </button>
            </div>
            {securityData?.usersWithout2FA ? (
              <>
                <div className="stats-bar">
                  <span>Total Users: {securityData.usersWithout2FA.total}</span>
                  <span>Without 2FA: {securityData.usersWithout2FA.without2FA}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Admin</th>
                      <th>Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityData.usersWithout2FA.users?.map((user, index) => (
                      <tr key={index}>
                        <td>{user.email}</td>
                        <td>{user.name || '-'}</td>
                        <td>
                          {user.isAdmin && (
                            <span className="admin-badge">Admin</span>
                          )}
                        </td>
                        <td>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
                      </tr>
                    ))}
                    {(!securityData.usersWithout2FA.users || securityData.usersWithout2FA.users.length === 0) && (
                      <tr>
                        <td colSpan="4" className="no-data">All users have 2FA enabled!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="no-data">Click refresh to load user data</p>
            )}
          </div>
        </div>
      )}

      {/* Admin Accounts Tab */}
      {activeTab === 'admins' && (
        <div className="tab-content">
          <div className="data-card">
            <div className="card-header">
              <h3>Administrator Accounts</h3>
              <button
                className="refresh-button"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const admins = await getAdminAccounts();
                    setSecurityData(prev => ({ ...prev, adminAccounts: admins }));
                  } catch (err) {
                    setError('Failed to fetch admins: ' + err.message);
                  }
                  setRefreshing(false);
                }}
                disabled={refreshing}
              >
                Refresh
              </button>
            </div>
            {securityData?.adminAccounts ? (
              <>
                <div className="stats-bar">
                  <span>Total Admins: {securityData.adminAccounts.totalAdmins}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>2FA</th>
                      <th>Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityData.adminAccounts.admins?.map((admin, index) => (
                      <tr key={index}>
                        <td>{admin.email}</td>
                        <td>{admin.name || '-'}</td>
                        <td>
                          {admin.superAdmin ? (
                            <span className="super-admin-badge">Super Admin</span>
                          ) : (
                            <span className="admin-badge">Admin</span>
                          )}
                        </td>
                        <td>
                          {admin.has2FA ? (
                            <span className="status-enabled">Enabled</span>
                          ) : (
                            <span className="status-disabled">DISABLED</span>
                          )}
                        </td>
                        <td>{admin.lastLogin ? new Date(admin.lastLogin).toLocaleDateString() : 'Never'}</td>
                      </tr>
                    ))}
                    {(!securityData.adminAccounts.admins || securityData.adminAccounts.admins.length === 0) && (
                      <tr>
                        <td colSpan="5" className="no-data">No admin accounts found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="no-data">Click refresh to load admin accounts</p>
            )}
          </div>
        </div>
      )}

      {/* External Sharing Tab */}
      {activeTab === 'sharing' && (
        <div className="tab-content">
          <div className="data-card">
            <div className="card-header">
              <h3>Externally Shared Files</h3>
              <button
                className="refresh-button"
                onClick={async () => {
                  setRefreshing(true);
                  try {
                    const sharing = await getExternalSharing();
                    setSecurityData(prev => ({ ...prev, externalSharing: sharing }));
                  } catch (err) {
                    setError('Failed to fetch sharing data: ' + err.message);
                  }
                  setRefreshing(false);
                }}
                disabled={refreshing}
              >
                Refresh
              </button>
            </div>
            {securityData?.externalSharing ? (
              <>
                <div className="stats-bar">
                  <span>Externally Shared: {securityData.externalSharing.totalExternalFiles}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Type</th>
                      <th>Owner</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securityData.externalSharing.files?.map((file, index) => (
                      <tr key={index}>
                        <td>{file.name}</td>
                        <td>{file.type?.split('/')[1] || file.type}</td>
                        <td>{file.owners?.join(', ') || '-'}</td>
                        <td>
                          {file.link && (
                            <a href={file.link} target="_blank" rel="noopener noreferrer">
                              View
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!securityData.externalSharing.files || securityData.externalSharing.files.length === 0) && (
                      <tr>
                        <td colSpan="4" className="no-data">No externally shared files found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="no-data">Click refresh to load external sharing data</p>
            )}
          </div>
        </div>
      )}

      {/* Last scan timestamp */}
      {securityData?.policies?.timestamp && (
        <div className="last-scan">
          Last scanned: {new Date(securityData.policies.timestamp).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default SecurityDashboard;
