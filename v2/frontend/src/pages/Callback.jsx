import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Handle Cognito OAuth callback if needed
    // For now, just redirect to home
    const code = searchParams.get('code');
    if (code) {
      // Handle Cognito callback
      navigate('/');
    }
  }, [navigate, searchParams]);

  return (
    <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
      Completing authentication...
    </div>
  );
}
