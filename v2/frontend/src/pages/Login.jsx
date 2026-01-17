import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'signup'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);
        setMode('login');
        setError('Account created! Please check your email to verify, then log in.');
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Complens.ai</h1>
        <p className="text-muted mb-4">OAuth App Audit</p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              padding: '0.75rem',
              marginBottom: '1rem',
              borderRadius: 'var(--radius)',
              background: error.includes('created') ? '#f0fdf4' : '#fef2f2',
              color: error.includes('created') ? 'var(--color-success)' : 'var(--color-danger)',
              fontSize: '0.875rem',
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label className="text-sm" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.625rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="text-sm" style={{ display: 'block', marginBottom: '0.5rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              style={{
                width: '100%',
                padding: '0.625rem',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        <p className="text-sm text-muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                onClick={() => setMode('signup')}
                style={{ color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                style={{ color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
