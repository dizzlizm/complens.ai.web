const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);

    // Get or create user profile
    const profile = await db.getOrCreateUser(user.userId, user.email);

    // Get user's organizations
    const organizations = await db.listUserOrganizations(user.userId);

    return response.ok({
      userId: profile.userId,
      email: profile.email,
      createdAt: profile.createdAt,
      organizations: organizations.map(org => ({
        orgId: org.orgId,
        name: org.name,
        role: org.role,
        createdAt: org.createdAt,
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
