/**
 * Authentication Service
 * Handles Cognito authentication without AWS Amplify
 * Uses amazon-cognito-identity-js directly for lighter bundle size
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

// Cognito configuration (will be injected from CloudFormation outputs)
const COGNITO_CONFIG = {
  UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID,
  ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID,
  Region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
};

// Create User Pool
const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_CONFIG.UserPoolId,
  ClientId: COGNITO_CONFIG.ClientId,
});

class AuthService {
  /**
   * Sign up a new user
   */
  async signUp(email, password, name) {
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({
          Name: 'email',
          Value: email,
        }),
      ];

      if (name) {
        attributeList.push(
          new CognitoUserAttribute({
            Name: 'name',
            Value: name,
          })
        );
      }

      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          user: result.user,
          userConfirmed: result.userConfirmed,
          userSub: result.userSub,
        });
      });
    });
  }

  /**
   * Confirm signup with verification code
   */
  async confirmSignUp(email, code) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Sign in with email and password
   */
  async signIn(email, password) {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const tokens = {
            idToken: result.getIdToken().getJwtToken(),
            accessToken: result.getAccessToken().getJwtToken(),
            refreshToken: result.getRefreshToken().getToken(),
          };

          // Store tokens in localStorage
          this.storeTokens(tokens);

          resolve({
            tokens,
            user: result.getIdToken().payload,
          });
        },
        onFailure: (err) => {
          reject(err);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          // Handle new password requirement
          reject(new Error('New password required'));
        },
      });
    });
  }

  /**
   * Sign out current user
   */
  signOut() {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
    this.clearTokens();
  }

  /**
   * Get current user session
   */
  async getCurrentSession() {
    return new Promise((resolve, reject) => {
      const cognitoUser = userPool.getCurrentUser();

      if (!cognitoUser) {
        reject(new Error('No current user'));
        return;
      }

      cognitoUser.getSession((err, session) => {
        if (err) {
          reject(err);
          return;
        }

        if (!session.isValid()) {
          reject(new Error('Session is not valid'));
          return;
        }

        resolve({
          session,
          tokens: {
            idToken: session.getIdToken().getJwtToken(),
            accessToken: session.getAccessToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
          },
          user: session.getIdToken().payload,
        });
      });
    });
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const { user } = await this.getCurrentSession();
      return user;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get ID token for API requests
   */
  async getIdToken() {
    try {
      const { tokens } = await this.getCurrentSession();
      return tokens.idToken;
    } catch (error) {
      // Try to get from localStorage as fallback
      const stored = localStorage.getItem('cognito_id_token');
      return stored || null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated() {
    try {
      await this.getCurrentSession();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Forgot password - initiate reset
   */
  async forgotPassword(email) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: (result) => {
          resolve(result);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  /**
   * Confirm password reset with code
   */
  async confirmPassword(email, code, newPassword) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => {
          resolve();
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  }

  /**
   * Resend verification code
   */
  async resendConfirmationCode(email) {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Store tokens in localStorage
   */
  storeTokens(tokens) {
    localStorage.setItem('cognito_id_token', tokens.idToken);
    localStorage.setItem('cognito_access_token', tokens.accessToken);
    localStorage.setItem('cognito_refresh_token', tokens.refreshToken);
  }

  /**
   * Clear tokens from localStorage
   */
  clearTokens() {
    localStorage.removeItem('cognito_id_token');
    localStorage.removeItem('cognito_access_token');
    localStorage.removeItem('cognito_refresh_token');
  }
}

export default new AuthService();
