/**
 * Microsoft Graph API integration
 * Uses client credentials flow (app-only auth) for tenant-wide access
 *
 * Required Azure AD App permissions (Application, not Delegated):
 * - Application.Read.All
 * - Directory.Read.All
 * - AuditLog.Read.All (optional, for consent history)
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

// Token cache: { tenantId: { token, expiry } }
const tokenCache = new Map();

/**
 * Get client secret from Secrets Manager
 */
async function getClientSecret(secretArn) {
  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: secretArn,
  }));
  return result.SecretString;
}

/**
 * Get app-only access token using client credentials flow
 * This allows tenant-wide access without user interaction
 */
exports.getAppOnlyToken = async (tenantId, clientId, clientSecretArn) => {
  // Check cache first
  const cached = tokenCache.get(tenantId);
  if (cached && cached.expiry > Date.now() + 60000) { // 1 min buffer
    return cached.token;
  }

  const clientSecret = await getClientSecret(clientSecretArn);

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get app-only token: ${error}`);
  }

  const data = await response.json();
  const token = data.access_token;
  const expiry = Date.now() + (data.expires_in * 1000);

  // Cache the token
  tokenCache.set(tenantId, { token, expiry });

  return token;
};

/**
 * Validate connection credentials by attempting to get a token and org info
 */
exports.validateConnection = async (tenantId, clientId, clientSecretArn) => {
  try {
    const token = await exports.getAppOnlyToken(tenantId, clientId, clientSecretArn);
    const org = await exports.getOrganization(token);

    return {
      valid: true,
      tenantId: org.id,
      tenantName: org.displayName,
      verifiedDomains: org.verifiedDomains?.map(d => d.name) || [],
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
};

/**
 * Make authenticated Graph API request
 */
async function graphRequest(accessToken, endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://graph.microsoft.com/v1.0${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Graph API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Get organization info
 */
exports.getOrganization = async (accessToken) => {
  const result = await graphRequest(accessToken, '/organization');
  return result.value?.[0];
};

/**
 * List all service principals (OAuth/Enterprise apps)
 */
exports.listServicePrincipals = async (accessToken) => {
  const apps = [];
  let nextLink = '/servicePrincipals?$select=id,appId,displayName,appDisplayName,publisherName,homepage,replyUrls,servicePrincipalType,tags,accountEnabled,createdDateTime,appOwnerOrganizationId&$top=100';

  while (nextLink) {
    const result = await graphRequest(accessToken, nextLink);
    apps.push(...(result.value || []));
    nextLink = result['@odata.nextLink'];
  }

  return apps;
};

/**
 * Get OAuth2 permission grants (delegated permissions that have been consented)
 */
exports.listOAuth2Grants = async (accessToken) => {
  const grants = [];
  let nextLink = '/oauth2PermissionGrants?$top=100';

  while (nextLink) {
    const result = await graphRequest(accessToken, nextLink);
    grants.push(...(result.value || []));
    nextLink = result['@odata.nextLink'];
  }

  return grants;
};

/**
 * Get app role assignments for a service principal (application permissions)
 */
exports.listAppRoleAssignments = async (accessToken, servicePrincipalId) => {
  try {
    const result = await graphRequest(
      accessToken,
      `/servicePrincipals/${servicePrincipalId}/appRoleAssignments`
    );
    return result.value || [];
  } catch (e) {
    return [];
  }
};

/**
 * Get all app role assignments in the tenant
 */
exports.listAllAppRoleAssignments = async (accessToken, servicePrincipals) => {
  const assignments = new Map();

  // Get app role assignments for each service principal
  // This shows what application permissions each app has
  for (const sp of servicePrincipals) {
    const roles = await exports.listAppRoleAssignments(accessToken, sp.id);
    if (roles.length > 0) {
      assignments.set(sp.id, roles);
    }
  }

  return assignments;
};

/**
 * Full OAuth App Audit scan
 * Returns structured data about all OAuth apps and their permissions
 */
exports.scanOAuthApps = async (accessToken) => {
  // Get all service principals
  const servicePrincipals = await exports.listServicePrincipals(accessToken);

  // Get all delegated permission grants
  const grants = await exports.listOAuth2Grants(accessToken);

  // Build a map of grants by service principal ID
  const grantsByPrincipal = {};
  for (const grant of grants) {
    const clientId = grant.clientId;
    if (!grantsByPrincipal[clientId]) {
      grantsByPrincipal[clientId] = [];
    }
    grantsByPrincipal[clientId].push({
      scope: grant.scope,
      consentType: grant.consentType,
      principalId: grant.principalId,
    });
  }

  // Filter to third-party apps and build audit results
  const auditedApps = servicePrincipals
    .filter(sp => {
      // Include apps that are:
      // 1. Application type (not managed identity, etc.)
      // 2. Third-party (different owner org) OR have permission grants
      return sp.servicePrincipalType === 'Application' &&
        (sp.appOwnerOrganizationId !== sp.appId || grantsByPrincipal[sp.id]);
    })
    .map(sp => {
      const delegatedGrants = grantsByPrincipal[sp.id] || [];
      const delegatedScopes = [...new Set(
        delegatedGrants.flatMap(g => g.scope?.split(' ') || []).filter(Boolean)
      )];

      const isFirstParty = isFirstPartyApp(sp.appOwnerOrganizationId);

      return {
        appId: sp.appId,
        servicePrincipalId: sp.id,
        displayName: sp.appDisplayName || sp.displayName,
        publisher: sp.publisherName || (isFirstParty ? 'Microsoft' : 'Unknown'),
        publisherOrgId: sp.appOwnerOrganizationId,
        isFirstParty,
        enabled: sp.accountEnabled,
        createdAt: sp.createdDateTime,
        homepage: sp.homepage,
        delegatedPermissions: delegatedScopes,
        consentType: delegatedGrants.some(g => g.consentType === 'AllPrincipals')
          ? 'admin_consent'
          : delegatedGrants.length > 0
            ? 'user_consent'
            : 'none',
        userCount: new Set(delegatedGrants.map(g => g.principalId).filter(Boolean)).size,
        riskLevel: calculateRiskLevel(delegatedScopes, isFirstParty),
        riskFactors: getRiskFactors(delegatedScopes, sp),
      };
    });

  // Sort by risk level
  const riskOrder = { high: 0, medium: 1, low: 2 };
  auditedApps.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

  return {
    totalApps: auditedApps.length,
    summary: {
      highRisk: auditedApps.filter(a => a.riskLevel === 'high').length,
      mediumRisk: auditedApps.filter(a => a.riskLevel === 'medium').length,
      lowRisk: auditedApps.filter(a => a.riskLevel === 'low').length,
      thirdParty: auditedApps.filter(a => !a.isFirstParty).length,
      firstParty: auditedApps.filter(a => a.isFirstParty).length,
    },
    apps: auditedApps,
    scannedAt: new Date().toISOString(),
  };
};

/**
 * Check if app is Microsoft first-party
 */
function isFirstPartyApp(ownerOrgId) {
  const microsoftOrgIds = [
    'f8cdef31-a31e-4b4a-93e4-5f571e91255a', // Microsoft Services
    '72f988bf-86f1-41af-91ab-2d7cd011db47', // Microsoft Corp
  ];
  return microsoftOrgIds.includes(ownerOrgId);
}

/**
 * Calculate risk level based on permissions
 */
function calculateRiskLevel(scopes, isFirstParty) {
  // First-party Microsoft apps are generally lower risk
  if (isFirstParty && scopes.length === 0) return 'low';

  const highRiskScopes = [
    'Mail.ReadWrite', 'Mail.ReadWrite.All',
    'Mail.Send', 'Mail.Send.All',
    'Files.ReadWrite.All',
    'Directory.ReadWrite.All',
    'User.ReadWrite.All',
    'Application.ReadWrite.All',
    'RoleManagement.ReadWrite.Directory',
    'Sites.ReadWrite.All',
    'Group.ReadWrite.All',
  ];

  const mediumRiskScopes = [
    'Mail.Read', 'Mail.Read.All',
    'Files.Read.All',
    'Calendars.ReadWrite', 'Calendars.ReadWrite.All',
    'Contacts.ReadWrite', 'Contacts.ReadWrite.All',
    'Directory.Read.All',
    'User.Read.All',
    'Sites.Read.All',
    'Group.Read.All',
  ];

  const hasHighRisk = scopes.some(s => highRiskScopes.includes(s));
  const hasMediumRisk = scopes.some(s => mediumRiskScopes.includes(s));

  if (hasHighRisk) return 'high';
  if (hasMediumRisk) return 'medium';
  return 'low';
}

/**
 * Get specific risk factors for an app
 */
function getRiskFactors(scopes, sp) {
  const factors = [];

  // Check for risky permissions
  if (scopes.some(s => s.includes('Mail.Send'))) {
    factors.push({ type: 'permission', severity: 'high', description: 'Can send email as users' });
  }
  if (scopes.some(s => s.includes('Mail.ReadWrite'))) {
    factors.push({ type: 'permission', severity: 'high', description: 'Can read and modify email' });
  }
  if (scopes.some(s => s.includes('Files.ReadWrite.All'))) {
    factors.push({ type: 'permission', severity: 'high', description: 'Can access all files in OneDrive/SharePoint' });
  }
  if (scopes.some(s => s.includes('Directory.ReadWrite'))) {
    factors.push({ type: 'permission', severity: 'high', description: 'Can modify directory objects' });
  }

  // Check for unknown publisher
  if (!sp.publisherName && !isFirstPartyApp(sp.appOwnerOrganizationId)) {
    factors.push({ type: 'publisher', severity: 'medium', description: 'Unknown publisher' });
  }

  // Check if app is disabled (might indicate it was found malicious)
  if (!sp.accountEnabled) {
    factors.push({ type: 'status', severity: 'info', description: 'App is disabled' });
  }

  return factors;
}
