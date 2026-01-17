const response = require('../../shared/response');
const { requireAuth } = require('../../shared/auth');
const db = require('../../shared/db');
const microsoft = require('../../shared/microsoft');

exports.handler = async (event) => {
  try {
    const user = requireAuth(event);
    const { orgId, propId, connId } = event.pathParameters || {};
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    if (!orgId || !propId || !connId) {
      return response.badRequest('Organization ID, Property ID, and Connection ID required');
    }

    // Check membership
    const member = await db.getMember(orgId, user.userId);
    if (!member) {
      return response.forbidden('Not a member of this organization');
    }

    // Verify property belongs to org
    const property = await db.getProperty(orgId, propId);
    if (!property) {
      return response.notFound('Property not found');
    }

    // Get connection
    const connection = await db.getConnectionByPropId(propId, connId);
    if (!connection) {
      return response.notFound('Connection not found');
    }

    if (method === 'GET') {
      return handleList(connection, member);
    } else if (method === 'POST' && path.endsWith('/scan')) {
      return handleScan(connection, member, propId);
    }

    return response.badRequest('Invalid request');
  } catch (error) {
    console.error('Apps error:', error);
    if (error.statusCode === 401) return response.unauthorized();
    if (error.statusCode === 403) return response.forbidden(error.message);
    return response.serverError(error.message);
  }
};

async function handleList(connection, member) {
  if (!db.hasPermission(member.role, 'view_results')) {
    return response.forbidden('Insufficient permissions to view apps');
  }

  const apps = await db.listApps(connection.connId);

  // Group by risk level
  const summary = {
    total: apps.length,
    highRisk: apps.filter(a => a.riskLevel === 'high').length,
    mediumRisk: apps.filter(a => a.riskLevel === 'medium').length,
    lowRisk: apps.filter(a => a.riskLevel === 'low').length,
    thirdParty: apps.filter(a => !a.isFirstParty).length,
    firstParty: apps.filter(a => a.isFirstParty).length,
  };

  return response.ok({
    connId: connection.connId,
    tenantName: connection.tenantName,
    lastScannedAt: connection.lastScannedAt,
    summary,
    apps: apps.map(a => ({
      appId: a.appId,
      displayName: a.displayName,
      publisher: a.publisher,
      isFirstParty: a.isFirstParty,
      enabled: a.enabled,
      createdAt: a.createdAt,
      delegatedPermissions: a.delegatedPermissions,
      consentType: a.consentType,
      userCount: a.userCount,
      riskLevel: a.riskLevel,
      riskFactors: a.riskFactors,
      discoveredAt: a.discoveredAt,
    })),
  });
}

async function handleScan(connection, member, propId) {
  if (!db.hasPermission(member.role, 'run_scans')) {
    return response.forbidden('Insufficient permissions to run scans');
  }

  // Get access token using client credentials flow
  const accessToken = await microsoft.getAppOnlyToken(
    connection.tenantId,
    connection.clientId,
    connection.clientSecretArn
  );

  // Perform scan
  const scanResult = await microsoft.scanOAuthApps(accessToken);

  // Save apps
  await db.saveApps(connection.connId, scanResult.apps);

  // Update connection scan time
  await db.updateConnectionScanTime(propId, connection.connId);

  // Save scan history
  await db.saveScan(connection.connId, {
    totalApps: scanResult.totalApps,
    highRisk: scanResult.summary.highRisk,
    mediumRisk: scanResult.summary.mediumRisk,
    lowRisk: scanResult.summary.lowRisk,
    thirdParty: scanResult.summary.thirdParty,
    firstParty: scanResult.summary.firstParty,
  });

  return response.ok({
    connId: connection.connId,
    tenantName: connection.tenantName,
    scannedAt: scanResult.scannedAt,
    summary: scanResult.summary,
    apps: scanResult.apps,
  });
}
