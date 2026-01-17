const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const method = event.requestContext.http.method;
    const { orgId, propId } = event.pathParameters || {};

    if (!orgId) {
      return response.badRequest('Organization ID required');
    }

    // Check membership
    const member = await db.getMember(orgId, user.userId);
    if (!member) {
      return response.forbidden('Not a member of this organization');
    }

    switch (method) {
      case 'GET':
        return propId ? handleGet(orgId, propId, member) : handleList(orgId);
      case 'POST':
        return handleCreate(orgId, member, event);
      case 'PUT':
        return handleUpdate(orgId, propId, member, event);
      case 'DELETE':
        return handleDelete(orgId, propId, member);
      default:
        return response.badRequest('Invalid method');
    }
  } catch (error) {
    console.error('Properties error:', error);
    if (error.statusCode === 401) return response.unauthorized();
    if (error.statusCode === 403) return response.forbidden(error.message);
    return response.serverError(error.message);
  }
};

async function handleList(orgId) {
  const properties = await db.listProperties(orgId);

  // Get connection counts for each property
  const enriched = await Promise.all(
    properties.map(async (prop) => {
      const connections = await db.listConnections(prop.propId);
      return {
        ...prop,
        connectionCount: connections.length,
      };
    })
  );

  return response.ok({ properties: enriched });
}

async function handleGet(orgId, propId, member) {
  const property = await db.getProperty(orgId, propId);
  if (!property) {
    return response.notFound('Property not found');
  }

  const connections = await db.listConnections(propId);

  return response.ok({
    ...property,
    connections: connections.map(c => ({
      connId: c.connId,
      tenantName: c.tenantName,
      tenantId: c.tenantId,
      provider: c.provider,
      status: c.status,
      lastScannedAt: c.lastScannedAt,
    })),
  });
}

async function handleCreate(orgId, member, event) {
  if (!db.hasPermission(member.role, 'manage_properties')) {
    return response.forbidden('Insufficient permissions to create properties');
  }

  const body = JSON.parse(event.body || '{}');

  if (!body.name || body.name.trim().length < 2) {
    return response.badRequest('Property name is required (min 2 characters)');
  }

  const property = await db.createProperty(orgId, body.name.trim(), body.description || '');
  return response.created(property);
}

async function handleUpdate(orgId, propId, member, event) {
  if (!propId) {
    return response.badRequest('Property ID required');
  }

  if (!db.hasPermission(member.role, 'manage_properties')) {
    return response.forbidden('Insufficient permissions to update properties');
  }

  const property = await db.getProperty(orgId, propId);
  if (!property) {
    return response.notFound('Property not found');
  }

  const body = JSON.parse(event.body || '{}');

  if (!body.name || body.name.trim().length < 2) {
    return response.badRequest('Property name is required (min 2 characters)');
  }

  await db.updateProperty(orgId, propId, {
    name: body.name.trim(),
    description: body.description || '',
  });

  return response.ok({ success: true });
}

async function handleDelete(orgId, propId, member) {
  if (!propId) {
    return response.badRequest('Property ID required');
  }

  if (!db.hasPermission(member.role, 'manage_properties')) {
    return response.forbidden('Insufficient permissions to delete properties');
  }

  const property = await db.getProperty(orgId, propId);
  if (!property) {
    return response.notFound('Property not found');
  }

  // Check if there are connections
  const connections = await db.listConnections(propId);
  if (connections.length > 0) {
    return response.badRequest('Cannot delete property with active connections. Remove connections first.');
  }

  await db.deleteProperty(orgId, propId);
  return response.noContent();
}
