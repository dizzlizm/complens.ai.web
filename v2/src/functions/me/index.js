const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);

    // Get or create user profile
    let profile = await db.getUser(user.userId);

    if (!profile) {
      profile = await db.createUser(user.userId, user.email);
    }

    // Get user's connections
    const connections = await db.listConnections(user.userId);

    return response.ok({
      userId: profile.userId,
      email: profile.email,
      createdAt: profile.createdAt,
      connections: connections.map(c => ({
        connectionId: c.connectionId,
        provider: c.provider,
        tenantName: c.tenantName,
        lastScannedAt: c.lastScannedAt,
      })),
    });
  } catch (error) {
    console.error('Error in /me:', error);
    if (error.statusCode === 401) {
      return response.unauthorized();
    }
    return response.serverError(error.message);
  }
};
