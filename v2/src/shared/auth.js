/**
 * Authentication helpers
 * Extract user info from Cognito JWT (validated by API Gateway)
 */

/**
 * Get user ID and email from API Gateway event
 * API Gateway validates the JWT and passes claims in requestContext
 */
exports.getUserFromEvent = (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    return null;
  }

  return {
    userId: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === 'true',
  };
};

/**
 * Require authenticated user or throw
 */
exports.requireAuth = (event) => {
  const user = exports.getUserFromEvent(event);

  if (!user) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  return user;
};
