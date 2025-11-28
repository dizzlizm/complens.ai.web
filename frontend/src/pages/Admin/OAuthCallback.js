import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './OAuthCallback.css';

function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing OAuth authorization...');

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setStatus('success');
      setMessage('Successfully connected to Google Workspace!');

      // Redirect to OAuth page after 2 seconds
      setTimeout(() => {
        navigate('/admin/oauth');
      }, 2000);
    } else if (error) {
      setStatus('error');
      setMessage(decodeURIComponent(error));
    } else {
      setStatus('error');
      setMessage('Unknown error occurred during OAuth authorization');
    }
  }, [searchParams, navigate]);

  return (
    <div className="oauth-callback">
      <div className="callback-container">
        <div className={`callback-card ${status}`}>
          {status === 'processing' && (
            <div className="callback-icon">
              <div className="spinner"></div>
            </div>
          )}

          {status === 'success' && (
            <div className="callback-icon success">✓</div>
          )}

          {status === 'error' && (
            <div className="callback-icon error">✕</div>
          )}

          <h2>{message}</h2>

          {status === 'success' && (
            <p>Redirecting to admin panel...</p>
          )}

          {status === 'error' && (
            <div className="callback-actions">
              <button onClick={() => navigate('/admin/oauth')} className="btn btn-primary">
                Back to OAuth Settings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default OAuthCallback;
