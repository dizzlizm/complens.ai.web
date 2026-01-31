import { Amplify } from 'aws-amplify';

// Get Cognito settings from environment variables
// These values come from your SAM deployment outputs
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

// Warn if Cognito is not configured (helpful for debugging)
if (!userPoolId || !userPoolClientId) {
  console.warn(
    'Cognito not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID environment variables.',
    '\nRun `make web-env` to generate .env.local from your deployed stack.'
  );
}

// Configure Amplify with Cognito settings
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      signUpVerificationMethod: 'code' as const,
      loginWith: {
        email: true,
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
      },
    },
  },
};

// Initialize Amplify immediately when this module is imported
Amplify.configure(amplifyConfig);

export default amplifyConfig;
