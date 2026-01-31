import { Amplify } from 'aws-amplify';

// Get Cognito settings from environment variables
// These values come from your SAM deployment outputs
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID || '';
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '';

// Extract region from userPoolId (format: us-east-1_xxxxxxxx)
const region = userPoolId.split('_')[0] || 'us-east-1';

// Debug logging (remove in production)
console.log('Amplify Config:', {
  userPoolId: userPoolId ? `${userPoolId.substring(0, 15)}...` : 'NOT SET',
  userPoolClientId: userPoolClientId ? `${userPoolClientId.substring(0, 10)}...` : 'NOT SET',
  region,
});

// Warn if Cognito is not configured (helpful for debugging)
if (!userPoolId || !userPoolClientId) {
  console.error(
    'Cognito not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID environment variables.',
    '\nRun `make web-env` to generate .env.local from your deployed stack.'
  );
}

// Configure Amplify with Cognito settings (Amplify v6 format)
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      signUpVerificationMethod: 'code',
      loginWith: {
        email: true,
      },
    },
  },
});

export default { userPoolId, userPoolClientId, region };
