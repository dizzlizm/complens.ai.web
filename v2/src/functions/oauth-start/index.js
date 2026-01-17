const crypto = require('crypto');
const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const microsoft = require('../../shared/microsoft');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const body = JSON.parse(event.body || '{}');
    const provider = body.provider || 'microsoft';

    if (provider !== 'microsoft') {
      return response.badRequest('Only Microsoft provider is supported currently');
    }

    // Generate state token (includes user ID for callback)
    const stateData = {
      userId: user.userId,
      nonce: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    // Build redirect URI
    const apiBaseUrl = process.env.API_BASE_URL;
    const redirectUri = `${apiBaseUrl}/oauth/callback/microsoft`;

    // Build authorization URL
    const authUrl = microsoft.buildAuthUrl(state, redirectUri);

    return response.ok({
      authUrl,
      state,
    });
  } catch (error) {
    console.error('Error starting OAuth:', error);
    if (error.statusCode === 401) {
      return response.unauthorized();
    }
    return response.serverError(error.message);
  }
};
