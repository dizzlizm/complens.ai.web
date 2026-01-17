const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');
const microsoft = require('../../shared/microsoft');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const connectionId = event.pathParameters?.connectionId;
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (!connectionId) {
      return response.badRequest('Connection ID required');
    }

    // Verify connection belongs to user
    const connection = await db.getConnection(user.userId, connectionId);
    if (!connection) {
      return response.notFound('Connection not found');
    }

    if (method === 'GET' && !path.endsWith('/scan')) {
      return handleList(connection);
    } else if (method === 'POST' && path.endsWith('/scan')) {
      return handleScan(user, connection);
    }

    return response.badRequest('Invalid request');
  } catch (error) {
    console.error('Apps error:', error);
    if (error.statusCode === 401) {
      return response.unauthorized();
    }
    return response.serverError(error.message);
  }
};

async function handleList(connection) {
  const apps = await db.listApps(connection.connectionId);

  // Group by risk level
  const summary = {
    total: apps.length,
    highRisk: apps.filter(a => a.riskLevel === 'high').length,
    mediumRisk: apps.filter(a => a.riskLevel === 'medium').length,
    lowRisk: apps.filter(a => a.riskLevel === 'low').length,
  };

  return response.ok({
    connectionId: connection.connectionId,
    tenantName: connection.tenantName,
    lastScannedAt: connection.lastScannedAt,
    summary,
    apps: apps.map(a => ({
      appId: a.appId,
      displayName: a.displayName,
      publisher: a.publisher,
      enabled: a.enabled,
      createdAt: a.createdAt,
      delegatedPermissions: a.delegatedPermissions,
      consentType: a.consentType,
      riskLevel: a.riskLevel,
      discoveredAt: a.discoveredAt,
    })),
  });
}

async function handleScan(user, connection) {
  // Check if token needs refresh
  let accessToken = connection.accessToken;
  const tokenExpiry = new Date(connection.tokenExpiry);

  if (tokenExpiry <= new Date()) {
    // Refresh token
    const newTokens = await microsoft.refreshAccessToken(connection.refreshToken);
    accessToken = newTokens.accessToken;

    // Update stored tokens
    await db.updateConnectionTokens(user.userId, connection.connectionId, {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      tokenExpiry: newTokens.tokenExpiry,
    });
  }

  // Perform scan
  const scanResult = await microsoft.scanOAuthApps(accessToken);

  // Save apps
  await db.saveApps(connection.connectionId, scanResult.apps);

  // Save scan history
  await db.saveScan(connection.connectionId, {
    totalApps: scanResult.totalApps,
    highRisk: scanResult.apps.filter(a => a.riskLevel === 'high').length,
    mediumRisk: scanResult.apps.filter(a => a.riskLevel === 'medium').length,
    lowRisk: scanResult.apps.filter(a => a.riskLevel === 'low').length,
  });

  return response.ok({
    connectionId: connection.connectionId,
    scannedAt: scanResult.scannedAt,
    totalApps: scanResult.totalApps,
    summary: {
      highRisk: scanResult.apps.filter(a => a.riskLevel === 'high').length,
      mediumRisk: scanResult.apps.filter(a => a.riskLevel === 'medium').length,
      lowRisk: scanResult.apps.filter(a => a.riskLevel === 'low').length,
    },
    apps: scanResult.apps,
  });
}
