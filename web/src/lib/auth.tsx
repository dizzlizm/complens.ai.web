import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  updatePassword,
  getCurrentUser,
  fetchUserAttributes,
  type SignInInput,
  type SignUpInput,
} from 'aws-amplify/auth';

interface User {
  id: string;
  email: string;
  name?: string;
  agencyId?: string;
  workspaceIds?: string[];
  isSuperAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  confirmRegistration: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  globalSignOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      const attributes = await fetchUserAttributes();

      setUser({
        id: currentUser.userId,
        email: attributes.email || '',
        name: attributes.name,
        agencyId: attributes['custom:agency_id'],
        workspaceIds: attributes['custom:workspace_ids']?.split(','),
        isSuperAdmin: attributes['custom:is_super_admin'] === 'true',
      });
    } catch (error: unknown) {
      // Distinguish between auth errors and transient errors
      if (error instanceof Error) {
        // Legitimate auth failures - user is not authenticated
        const authErrorNames = [
          'NotAuthenticatedException',
          'UserUnAuthenticatedException',
          'UserNotFoundException',
          'UserNotConfirmedException',
        ];

        if (authErrorNames.includes(error.name)) {
          // User is genuinely not authenticated - clear state
          setUser(null);
          return;
        }

        // Network errors - don't log out, just log the error
        if (
          error.message.includes('Network') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('timeout') ||
          error.name === 'NetworkError'
        ) {
          console.warn('Network error during auth refresh, keeping current state:', error.message);
          // Don't change user state on network errors
          return;
        }

        // Unknown error - log it but don't automatically log out
        // This prevents data loss on temporary Cognito issues
        console.error('Auth refresh error:', error.name, error.message);
      }

      // If we can't determine the error type, assume not authenticated
      // This is the safe default for security
      setUser(null);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      await refreshUser();
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const input: SignInInput = { username: email, password };
    await signIn(input);
    await refreshUser();
  };

  const register = async (email: string, password: string, name: string) => {
    const input: SignUpInput = {
      username: email,
      password,
      options: {
        userAttributes: {
          email,
          name,
        },
      },
    };
    await signUp(input);
  };

  const confirmRegistration = async (email: string, code: string) => {
    await confirmSignUp({ username: email, confirmationCode: code });
  };

  const logout = async () => {
    await signOut();
    setUser(null);
  };

  const forgotPassword = async (email: string) => {
    await resetPassword({ username: email });
  };

  const confirmForgotPassword = async (email: string, code: string, newPassword: string) => {
    await confirmResetPassword({
      username: email,
      confirmationCode: code,
      newPassword,
    });
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    await updatePassword({ oldPassword, newPassword });
  };

  const globalSignOut = async () => {
    await signOut({ global: true });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        confirmRegistration,
        logout,
        forgotPassword,
        confirmForgotPassword,
        changePassword,
        globalSignOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
