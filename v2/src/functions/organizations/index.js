const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const method = event.requestContext.http.method;
    const orgId = event.pathParameters?.orgId;

    // Ensure user exists in our system
    await db.getOrCreateUser(user.userId, user.email);

    switch (method) {
      case 'GET':
        return orgId ? handleGet(user, orgId) : handleList(user);
      case 'POST':
        return handleCreate(user, event);
      case 'PUT':
        return handleUpdate(user, orgId, event);
      default:
        return response.badRequest('Invalid method');
    }
  } catch (error) {
    console.error('Organizations error:', error);
    if (error.statusCode === 401) return response.unauthorized();
    if (error.statusCode === 403) return response.forbidden(error.message);
    return response.serverError(error.message);
  }
};

async function handleList(user) {
  const orgs = await db.listUserOrganizations(user.userId);
  return response.ok({ organizations: orgs });
}

async function handleGet(user, orgId) {
  // Check membership
  const member = await db.getMember(orgId, user.userId);
  if (!member) {
    return response.forbidden('Not a member of this organization');
  }

  const org = await db.getOrganization(orgId);
  if (!org) {
    return response.notFound('Organization not found');
  }

  // Get members and properties count
  const [members, properties] = await Promise.all([
    db.listMembers(orgId),
    db.listProperties(orgId),
  ]);

  return response.ok({
    ...org,
    role: member.role,
    memberCount: members.length,
    propertyCount: properties.length,
  });
}

async function handleCreate(user, event) {
  const body = JSON.parse(event.body || '{}');

  if (!body.name || body.name.trim().length < 2) {
    return response.badRequest('Organization name is required (min 2 characters)');
  }

  const org = await db.createOrganization(body.name.trim(), user.userId);
  return response.created(org);
}

async function handleUpdate(user, orgId, event) {
  // Check membership and permission
  const member = await db.getMember(orgId, user.userId);
  if (!member) {
    return response.forbidden('Not a member of this organization');
  }

  if (!db.hasPermission(member.role, 'manage_properties')) {
    return response.forbidden('Insufficient permissions');
  }

  const body = JSON.parse(event.body || '{}');

  if (!body.name || body.name.trim().length < 2) {
    return response.badRequest('Organization name is required (min 2 characters)');
  }

  await db.updateOrganization(orgId, { name: body.name.trim() });
  return response.ok({ success: true });
}
