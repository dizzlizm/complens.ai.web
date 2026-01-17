const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const method = event.requestContext.http.method;
    const { orgId, userId: targetUserId } = event.pathParameters || {};

    if (!orgId) {
      return response.badRequest('Organization ID required');
    }

    // Check caller's membership
    const callerMember = await db.getMember(orgId, user.userId);
    if (!callerMember) {
      return response.forbidden('Not a member of this organization');
    }

    switch (method) {
      case 'GET':
        return handleList(orgId, callerMember);
      case 'POST':
        return handleAdd(orgId, callerMember, event);
      case 'PUT':
        return handleUpdate(orgId, callerMember, targetUserId, event);
      case 'DELETE':
        return handleRemove(orgId, callerMember, targetUserId);
      default:
        return response.badRequest('Invalid method');
    }
  } catch (error) {
    console.error('Members error:', error);
    if (error.statusCode === 401) return response.unauthorized();
    if (error.statusCode === 403) return response.forbidden(error.message);
    return response.serverError(error.message);
  }
};

async function handleList(orgId, callerMember) {
  const members = await db.listMembers(orgId);

  // Enrich with user info
  const enrichedMembers = await Promise.all(
    members.map(async (m) => {
      const user = await db.getUser(m.userId);
      return {
        userId: m.userId,
        email: user?.email,
        role: m.role,
        addedAt: m.addedAt,
      };
    })
  );

  return response.ok({ members: enrichedMembers });
}

async function handleAdd(orgId, callerMember, event) {
  if (!db.hasPermission(callerMember.role, 'manage_members')) {
    return response.forbidden('Insufficient permissions to add members');
  }

  const body = JSON.parse(event.body || '{}');

  if (!body.email) {
    return response.badRequest('Email is required');
  }

  if (!body.role || !db.ROLES.includes(body.role)) {
    return response.badRequest(`Invalid role. Must be one of: ${db.ROLES.join(', ')}`);
  }

  // Can't add a role higher than or equal to your own (except owner adding owners)
  if (!db.canManageRole(callerMember.role, body.role) && callerMember.role !== 'owner') {
    return response.forbidden('Cannot assign a role equal to or higher than your own');
  }

  // For now, we need the user to exist in Cognito first
  // In a real app, you'd send an invite email
  // Here we just create a placeholder that will be filled when they log in
  const userId = body.userId || `pending:${body.email.toLowerCase()}`;

  const member = await db.addMember(orgId, userId, body.role, callerMember.userId);
  return response.created(member);
}

async function handleUpdate(orgId, callerMember, targetUserId, event) {
  if (!targetUserId) {
    return response.badRequest('User ID required');
  }

  if (!db.hasPermission(callerMember.role, 'manage_members')) {
    return response.forbidden('Insufficient permissions to update members');
  }

  const targetMember = await db.getMember(orgId, targetUserId);
  if (!targetMember) {
    return response.notFound('Member not found');
  }

  // Can't modify someone at or above your level
  if (!db.canManageRole(callerMember.role, targetMember.role)) {
    return response.forbidden('Cannot modify a member with equal or higher role');
  }

  const body = JSON.parse(event.body || '{}');

  if (!body.role || !db.ROLES.includes(body.role)) {
    return response.badRequest(`Invalid role. Must be one of: ${db.ROLES.join(', ')}`);
  }

  // Can't promote to a role equal to or above your own
  if (!db.canManageRole(callerMember.role, body.role) && callerMember.role !== 'owner') {
    return response.forbidden('Cannot assign a role equal to or higher than your own');
  }

  await db.updateMemberRole(orgId, targetUserId, body.role);
  return response.ok({ success: true });
}

async function handleRemove(orgId, callerMember, targetUserId) {
  if (!targetUserId) {
    return response.badRequest('User ID required');
  }

  // Can't remove yourself
  if (targetUserId === callerMember.userId) {
    return response.badRequest('Cannot remove yourself. Transfer ownership first.');
  }

  if (!db.hasPermission(callerMember.role, 'manage_members')) {
    return response.forbidden('Insufficient permissions to remove members');
  }

  const targetMember = await db.getMember(orgId, targetUserId);
  if (!targetMember) {
    return response.notFound('Member not found');
  }

  // Can't remove someone at or above your level
  if (!db.canManageRole(callerMember.role, targetMember.role)) {
    return response.forbidden('Cannot remove a member with equal or higher role');
  }

  await db.removeMember(orgId, targetUserId);
  return response.noContent();
}
