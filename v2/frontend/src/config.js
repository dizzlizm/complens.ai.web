// Configuration loaded from environment or defaults
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  cognito: {
    userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
    domain: import.meta.env.VITE_COGNITO_DOMAIN || '',
  },
};
