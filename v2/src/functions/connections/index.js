const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');
const microsoft = require('../../shared/microsoft');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const method = event.requestContext.http.method;
    const { orgId, propId, connId } = event.pathParameters || {};

    if (!orgId || !propId) {
      return response.badRequest('Organization ID and Property ID required');
    }

    // Check membership and permissions
    const member = await db.getMember(orgId, user.userId);
    if (!member) {
      return response.forbidden('Not a member of this organization');
    }

    // Verify property belongs to org
    const property = await db.getProperty(orgId, propId);
    if (!property) {
      return response.notFound('Property not found');
    }

    switch (method) {
      case 'GET':
        return connId ? handleGet(propId, connId) : handleList(propId);
      case 'POST':
        return handleCreate(propId, member, event);
      case 'DELETE':
        return handleDelete(propId, connId, member);
      default:
        return response.badRequest('Invalid method');
    }
  } catch (error) {
    console.error('Connections error:', error);
    if (error.statusCode === 401) return response.unauthorized();
    if (error.statusCode === 403) return response.forbidden(error.message);
    return response.serverError(error.message);
  }
};

async function handleList(propId) {
  const connections = await db.listConnections(propId);

  return response.ok({
    connections: connections.map(c => ({
      connId: c.connId,
      provider: c.provider,
      tenantId: c.tenantId,
      tenantName: c.tenantName,
      status: c.status,
      createdAt: c.createdAt,
      lastScannedAt: c.lastScannedAt,
    })),
  });
}

async function handleGet(propId, connId) {
  const connection = await db.getConnectionByPropId(propId, connId);
  if (!connection) {
    return response.notFound('Connection not found');
  }

  // Get scan history
  const scans = await db.listScans(connId, 5);

  return response.ok({
    connId: connection.connId,
    provider: connection.provider,
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
    status: connection.status,
    createdAt: connection.createdAt,
    lastScannedAt: connection.lastScannedAt,
    recentScans: scans.map(s => ({
      timestamp: s.timestamp,
      totalApps: s.totalApps,
      highRisk: s.highRisk,
      mediumRisk: s.mediumRisk,
      lowRisk: s.lowRisk,
    })),
  });
}

async function handleCreate(propId, member, event) {
  if (!db.hasPermission(member.role, 'manage_connections')) {
    return response.forbidden('Insufficient permissions to create connections');
  }

  const body = JSON.parse(event.body || '{}');

  // Required: tenantId (Microsoft tenant ID)
  // Required: clientId (App registration client ID)
  // Required: clientSecretArn (ARN of secret containing client secret)
  if (!body.tenantId) {
    return response.badRequest('Microsoft tenant ID is required');
  }

  if (!body.clientId) {
    return response.badRequest('App registration client ID is required');
  }

  if (!body.clientSecretArn) {
    return response.badRequest('Client secret ARN is required');
  }

  // Validate the connection by attempting to get a token and org info
  const validation = await microsoft.validateConnection(
    body.tenantId,
    body.clientId,
    body.clientSecretArn
  );

  if (!validation.valid) {
    return response.badRequest(`Invalid credentials: ${validation.error}`);
  }

  // Create the connection
  const connection = await db.createConnection(propId, {
    provider: 'microsoft',
    tenantId: validation.tenantId,
    tenantName: validation.tenantName || body.tenantName || 'Unknown',
    clientId: body.clientId,
    clientSecretArn: body.clientSecretArn,
  });

  return response.created({
    connId: connection.connId,
    provider: connection.provider,
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
    status: connection.status,
    verifiedDomains: validation.verifiedDomains,
  });
}

async function handleDelete(propId, connId, member) {
  if (!connId) {
    return response.badRequest('Connection ID required');
  }

  if (!db.hasPermission(member.role, 'manage_connections')) {
    return response.forbidden('Insufficient permissions to delete connections');
  }

  const connection = await db.getConnectionByPropId(propId, connId);
  if (!connection) {
    return response.notFound('Connection not found');
  }

  await db.deleteConnection(propId, connId);
  return response.noContent();
}
