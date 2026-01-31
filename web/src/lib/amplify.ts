import { Amplify } from 'aws-amplify';

// Configure Amplify with Cognito settings
// These values come from your SAM deployment outputs
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
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

export function configureAmplify() {
  Amplify.configure(amplifyConfig);
}

export default amplifyConfig;
