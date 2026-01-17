import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

export default function Connections() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [searchParams] = useSearchParams();

  const successMessage = searchParams.get('success') ? 'Connection added successfully!' : null;
  const errorMessage = searchParams.get('error');

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await api.getConnections();
      setConnections(data.connections || []);
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider) => {
    setConnecting(true);
    try {
      const { authUrl } = await api.startOAuth(provider);
      window.location.href = authUrl;
    } catch (err) {
      alert('Failed to start OAuth: ' + err.message);
      setConnecting(false);
    }
  };

  const handleDelete = async (connectionId, tenantName) => {
    if (!confirm(`Remove connection to ${tenantName}?`)) return;

    try {
      await api.deleteConnection(connectionId);
      setConnections(prev => prev.filter(c => c.connectionId !== connectionId));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Connections</h1>
          <p className="text-muted">Manage your OAuth app audit connections</p>
        </div>
      </div>

      {successMessage && (
        <div className="card" style={{ background: '#f0fdf4', borderColor: 'var(--color-success)' }}>
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="card" style={{ background: '#fef2f2', borderColor: 'var(--color-danger)' }}>
          {errorMessage}
        </div>
      )}

      <div className="card mb-4">
        <h2>Add Connection</h2>
        <p className="text-muted mb-4">Connect a service to audit its OAuth apps</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleConnect('microsoft')}
            disabled={connecting}
            className="btn btn-primary"
          >
            {connecting ? 'Connecting...' : 'Connect Microsoft 365'}
          </button>
          <button
            disabled
            className="btn btn-outline"
            title="Coming soon"
          >
            Connect Google Workspace
          </button>
        </div>
      </div>

      {connections.length > 0 && (
        <div>
          <h2 className="mb-4">Active Connections</h2>
          {connections.map(conn => (
            <div key={conn.connectionId} className="card flex justify-between items-center">
              <div>
                <h3>{conn.tenantName}</h3>
                <p className="text-sm text-muted">
                  {conn.provider} • Added {new Date(conn.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/connections/${conn.connectionId}`}
                  className="btn btn-primary"
                >
                  View Apps
                </a>
                <button
                  onClick={() => handleDelete(conn.connectionId, conn.tenantName)}
                  className="btn btn-outline"
                  style={{ color: 'var(--color-danger)' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
