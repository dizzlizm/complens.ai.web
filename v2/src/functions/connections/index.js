const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const method = event.requestContext.http.method;

    if (method === 'GET') {
      return handleList(user);
    } else if (method === 'DELETE') {
      const connectionId = event.pathParameters?.connectionId;
      return handleDelete(user, connectionId);
    }

    return response.badRequest('Method not allowed');
  } catch (error) {
    console.error('Connections error:', error);
    if (error.statusCode === 401) {
      return response.unauthorized();
    }
    return response.serverError(error.message);
  }
};

async function handleList(user) {
  const connections = await db.listConnections(user.userId);

  return response.ok({
    connections: connections.map(c => ({
      connectionId: c.connectionId,
      provider: c.provider,
      tenantId: c.tenantId,
      tenantName: c.tenantName,
      scopes: c.scopes,
      createdAt: c.createdAt,
      lastScannedAt: c.lastScannedAt,
    })),
  });
}

async function handleDelete(user, connectionId) {
  if (!connectionId) {
    return response.badRequest('Connection ID required');
  }

  // Verify connection belongs to user
  const connection = await db.getConnection(user.userId, connectionId);
  if (!connection) {
    return response.notFound('Connection not found');
  }

  await db.deleteConnection(user.userId, connectionId);
  return response.noContent();
}
