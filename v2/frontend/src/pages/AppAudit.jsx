import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';

export default function AppAudit() {
  const { connectionId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadApps();
  }, [connectionId]);

  const loadApps = async () => {
    try {
      const result = await api.getApps(connectionId);
      setData(result);
    } catch (err) {
      console.error('Failed to load apps:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const result = await api.scanApps(connectionId);
      setData(prev => ({
        ...prev,
        apps: result.apps,
        summary: result.summary,
        lastScannedAt: result.scannedAt,
      }));
    } catch (err) {
      alert('Scan failed: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Connection not found</div>;

  const { tenantName, summary, apps = [], lastScannedAt } = data;

  return (
    <div>
      <Link to="/connections" className="text-sm" style={{ color: 'var(--color-primary)' }}>
        ← Back to Connections
      </Link>

      <div className="flex justify-between items-center mt-4 mb-4">
        <div>
          <h1>{tenantName}</h1>
          <p className="text-muted">
            {lastScannedAt
              ? `Last scanned ${new Date(lastScannedAt).toLocaleString()}`
              : 'Not yet scanned'}
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn btn-primary"
        >
          {scanning ? 'Scanning...' : lastScannedAt ? 'Rescan' : 'Scan OAuth Apps'}
        </button>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }} className="mb-4">
          <div className="card">
            <p className="text-sm text-muted">Total Apps</p>
            <p style={{ fontSize: '2rem', fontWeight: 700 }}>{summary.total || apps.length}</p>
          </div>
          <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
            <p className="text-sm text-muted">High Risk</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-danger)' }}>
              {summary.highRisk || 0}
            </p>
          </div>
          <div className="card" style={{ borderColor: 'var(--color-warning)' }}>
            <p className="text-sm text-muted">Medium Risk</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-warning)' }}>
              {summary.mediumRisk || 0}
            </p>
          </div>
          <div className="card" style={{ borderColor: 'var(--color-success)' }}>
            <p className="text-sm text-muted">Low Risk</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-success)' }}>
              {summary.lowRisk || 0}
            </p>
          </div>
        </div>
      )}

      {apps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p className="text-muted">No apps found. Click "Scan OAuth Apps" to discover third-party apps.</p>
        </div>
      ) : (
        <div>
          <h2 className="mb-4">OAuth Apps ({apps.length})</h2>
          {apps
            .sort((a, b) => {
              const riskOrder = { high: 0, medium: 1, low: 2 };
              return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
            })
            .map(app => (
              <div key={app.appId} className="card">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3>{app.displayName}</h3>
                      <span className={`badge badge-${app.riskLevel}`}>
                        {app.riskLevel} risk
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {app.publisher || 'Unknown publisher'}
                      {app.consentType && ` • ${app.consentType.replace('_', ' ')}`}
                    </p>
                  </div>
                  <div className="text-sm text-muted">
                    {app.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>

                {app.delegatedPermissions?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted mb-2">Permissions:</p>
                    <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                      {app.delegatedPermissions.map(perm => (
                        <span
                          key={perm}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.25rem 0.5rem',
                            background: 'var(--color-bg)',
                            borderRadius: '4px',
                          }}
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
