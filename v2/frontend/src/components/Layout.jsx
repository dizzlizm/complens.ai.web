import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/connections', label: 'Connections' },
  ];

  return (
    <div>
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--color-border)',
        padding: '1rem 2rem',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center gap-4">
            <Link to="/" style={{ fontWeight: 700, fontSize: '1.25rem', textDecoration: 'none', color: 'var(--color-text)' }}>
              Complens.ai
            </Link>
            <nav className="flex gap-2">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    textDecoration: 'none',
                    color: location.pathname === item.path ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    background: location.pathname === item.path ? '#eff6ff' : 'transparent',
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted">{user?.email}</span>
            <button onClick={logout} className="btn btn-outline">
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </div>
  );
}
