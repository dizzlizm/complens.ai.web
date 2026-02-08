import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, LogIn, LogOut, UserX } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAcceptInvite } from '../../lib/hooks/useTeam';
import { AxiosError } from 'axios';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading, refreshUser, logout } = useAuth();
  const acceptInvite = useAcceptInvite();
  const [hasAttempted, setHasAttempted] = useState(false);

  useEffect(() => {
    if (!token || isAuthLoading || !isAuthenticated || hasAttempted) return;

    setHasAttempted(true);
    acceptInvite.mutate(token, {
      onSuccess: async () => {
        // Refresh user to pick up new workspace_ids from Cognito
        await refreshUser();
      },
    });
  }, [token, isAuthLoading, isAuthenticated, hasAttempted, acceptInvite, refreshUser]);

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Link</h2>
          <p className="text-gray-600 mb-6">
            This invitation link is missing a token. Please check your email for the correct link.
          </p>
          <Link to="/dashboard" className="btn btn-primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Still loading auth state
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  // Not authenticated - prompt to log in
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign in to Accept</h2>
          <p className="text-gray-600 mb-6">
            You need to sign in or create an account to accept this workspace invitation.
          </p>
          <div className="space-y-3">
            <Link
              to={`/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
              className="btn btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
            <Link
              to={`/register?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
              className="btn btn-secondary w-full"
            >
              Create Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Accepting invitation
  if (acceptInvite.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Accepting invitation...</p>
        </div>
      </div>
    );
  }

  // Success
  if (acceptInvite.isSuccess) {
    const result = acceptInvite.data;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {result.already_member ? 'Already a Member' : 'Invitation Accepted'}
          </h2>
          <p className="text-gray-600 mb-6">
            {result.already_member
              ? "You're already a member of this workspace."
              : `You've joined the workspace as ${result.role || 'a member'}.`}
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn btn-primary"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Error
  if (acceptInvite.isError) {
    const axiosError = acceptInvite.error as AxiosError<{ error: string; error_code?: string }>;
    const errorData = axiosError.response?.data;
    const errorCode = errorData?.error_code;
    const errorMessage = errorData?.error ||
      (acceptInvite.error instanceof Error ? acceptInvite.error.message : 'Failed to accept invitation');

    // Special case: Email mismatch - user is signed in with wrong account
    if (errorCode === 'EMAIL_MISMATCH') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <UserX className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Wrong Account</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <div className="space-y-3">
              <button
                onClick={() => logout()}
                className="btn btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out & Sign In with Correct Account
              </button>
              <Link to="/dashboard" className="btn btn-secondary w-full inline-block">
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Could Not Accept</h2>
          <p className="text-gray-600 mb-6">{errorMessage}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setHasAttempted(false);
              }}
              className="btn btn-primary w-full"
            >
              Try Again
            </button>
            <Link to="/dashboard" className="btn btn-secondary w-full inline-block">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
