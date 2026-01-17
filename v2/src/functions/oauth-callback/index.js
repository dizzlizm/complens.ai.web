const crypto = require('crypto');
const response = require('../../shared/response');
const db = require('../../shared/db');
const microsoft = require('../../shared/microsoft');

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const { code, state, error, error_description } = params;

    const frontendUrl = process.env.FRONTEND_URL;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      return response.redirect(
        `${frontendUrl}/connections?error=${encodeURIComponent(error_description || error)}`
      );
    }

    if (!code || !state) {
      return response.redirect(
        `${frontendUrl}/connections?error=${encodeURIComponent('Missing code or state')}`
      );
    }

    // Decode state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch (e) {
      return response.redirect(
        `${frontendUrl}/connections?error=${encodeURIComponent('Invalid state')}`
      );
    }

    // Verify state is recent (within 10 minutes)
    if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
      return response.redirect(
        `${frontendUrl}/connections?error=${encodeURIComponent('State expired')}`
      );
    }

    const userId = stateData.userId;

    // Exchange code for tokens
    const apiBaseUrl = process.env.API_BASE_URL || `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
    const redirectUri = `${apiBaseUrl}/oauth/callback/microsoft`;
    const tokens = await microsoft.exchangeCodeForTokens(code, redirectUri);

    // Get user and organization info
    const [meInfo, orgInfo] = await Promise.all([
      microsoft.getMe(tokens.accessToken),
      microsoft.getOrganization(tokens.accessToken),
    ]);

    // Create connection record
    const connectionId = crypto.randomUUID();
    await db.createConnection(userId, {
      connectionId,
      provider: 'microsoft',
      tenantId: orgInfo?.id || meInfo.id,
      tenantName: orgInfo?.displayName || meInfo.displayName || 'Unknown Tenant',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.tokenExpiry,
      scopes: tokens.scopes,
    });

    // Redirect back to frontend with success
    return response.redirect(
      `${frontendUrl}/connections?success=true&connectionId=${connectionId}`
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL;
    return response.redirect(
      `${frontendUrl}/connections?error=${encodeURIComponent('Failed to connect: ' + error.message)}`
    );
  }
};
