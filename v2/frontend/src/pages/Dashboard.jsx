import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMe()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  const connections = data?.connections || [];
  const hasConnections = connections.length > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">Overview of your OAuth app audits</p>
        </div>
      </div>

      {!hasConnections ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2>Get Started</h2>
          <p className="text-muted mb-4">
            Connect your Microsoft 365 or Google Workspace to audit OAuth apps
          </p>
          <Link to="/connections" className="btn btn-primary">
            Add Connection
          </Link>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            {connections.map(conn => (
              <Link
                key={conn.connectionId}
                to={`/connections/${conn.connectionId}`}
                className="card"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3>{conn.tenantName}</h3>
                    <p className="text-sm text-muted">{conn.provider}</p>
                  </div>
                  <span className="badge badge-low">
                    {conn.lastScannedAt ? 'Scanned' : 'Not scanned'}
                  </span>
                </div>
                {conn.lastScannedAt && (
                  <p className="text-sm text-muted mt-4">
                    Last scan: {new Date(conn.lastScannedAt).toLocaleDateString()}
                  </p>
                )}
              </Link>
            ))}
          </div>

          <div className="mt-4">
            <Link to="/connections" className="btn btn-outline">
              Manage Connections
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
