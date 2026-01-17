/**
 * Microsoft Graph API integration
 * Handles OAuth flow and API calls for OAuth App Audit
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({});

// Cache the client secret
let cachedClientSecret = null;

/**
 * Get Microsoft client secret from Secrets Manager
 */
async function getClientSecret() {
  if (cachedClientSecret) return cachedClientSecret;

  const secretArn = process.env.MICROSOFT_CLIENT_SECRET_ARN;
  if (!secretArn) {
    throw new Error('MICROSOFT_CLIENT_SECRET_ARN not configured');
  }

  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: secretArn,
  }));

  cachedClientSecret = result.SecretString;
  return cachedClientSecret;
}

/**
 * Build OAuth authorization URL
 */
exports.buildAuthUrl = (state, redirectUri) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;

  // Scopes needed to audit OAuth apps:
  // - User.Read: Get current user info
  // - Application.Read.All: List service principals (OAuth apps)
  // - AuditLog.Read.All: Read sign-in and app consent logs
  // - Directory.Read.All: Read tenant info
  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access', // For refresh token
    'User.Read',
    'Application.Read.All',
    'Directory.Read.All',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    response_mode: 'query',
  });

  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
};

/**
 * Exchange authorization code for tokens
 */
exports.exchangeCodeForTokens = async (code, redirectUri) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = await getClientSecret();

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokens = await response.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scopes: tokens.scope?.split(' ') || [],
  };
};

/**
 * Refresh access token
 */
exports.refreshAccessToken = async (refreshToken) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = await getClientSecret();

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokens = await response.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    expiresIn: tokens.expires_in,
    tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
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
 * Get current user profile
 */
exports.getMe = async (accessToken) => {
  return graphRequest(accessToken, '/me');
};

/**
 * Get organization info
 */
exports.getOrganization = async (accessToken) => {
  const result = await graphRequest(accessToken, '/organization');
  return result.value?.[0];
};

/**
 * List all OAuth/Enterprise apps (service principals) with consent grants
 * This is the core of OAuth App Audit
 */
exports.listOAuthApps = async (accessToken) => {
  const apps = [];
  let nextLink = '/servicePrincipals?$select=id,appId,displayName,appDisplayName,publisherName,homepage,replyUrls,servicePrincipalType,tags,accountEnabled,createdDateTime&$top=100';

  while (nextLink) {
    const result = await graphRequest(accessToken, nextLink);
    apps.push(...(result.value || []));
    nextLink = result['@odata.nextLink'];
  }

  return apps;
};

/**
 * Get OAuth2 permission grants (what permissions have been consented)
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
 * Get app role assignments (application permissions)
 */
exports.listAppRoleAssignments = async (accessToken, servicePrincipalId) => {
  try {
    const result = await graphRequest(
      accessToken,
      `/servicePrincipals/${servicePrincipalId}/appRoleAssignments`
    );
    return result.value || [];
  } catch (e) {
    // Some service principals may not allow this query
    return [];
  }
};

/**
 * Full OAuth App Audit scan
 * Returns structured data about all OAuth apps and their permissions
 */
exports.scanOAuthApps = async (accessToken) => {
  // Get all service principals (OAuth apps)
  const servicePrincipals = await exports.listOAuthApps(accessToken);

  // Get all delegated permission grants
  const grants = await exports.listOAuth2Grants(accessToken);

  // Build a map of grants by service principal
  const grantsByPrincipal = {};
  for (const grant of grants) {
    const clientId = grant.clientId;
    if (!grantsByPrincipal[clientId]) {
      grantsByPrincipal[clientId] = [];
    }
    grantsByPrincipal[clientId].push({
      scope: grant.scope,
      consentType: grant.consentType, // 'AllPrincipals' or 'Principal'
      principalId: grant.principalId,
    });
  }

  // Combine into audit results
  const auditedApps = servicePrincipals
    .filter(sp => sp.servicePrincipalType === 'Application')
    .map(sp => {
      const delegatedGrants = grantsByPrincipal[sp.id] || [];
      const allScopes = [...new Set(
        delegatedGrants.flatMap(g => g.scope?.split(' ') || []).filter(Boolean)
      )];

      return {
        appId: sp.appId,
        displayName: sp.appDisplayName || sp.displayName,
        publisher: sp.publisherName,
        enabled: sp.accountEnabled,
        createdAt: sp.createdDateTime,
        homepage: sp.homepage,
        servicePrincipalId: sp.id,
        delegatedPermissions: allScopes,
        consentType: delegatedGrants.some(g => g.consentType === 'AllPrincipals')
          ? 'admin_consent'
          : delegatedGrants.length > 0
            ? 'user_consent'
            : 'none',
        riskLevel: calculateRiskLevel(allScopes),
      };
    });

  return {
    totalApps: auditedApps.length,
    apps: auditedApps,
    scannedAt: new Date().toISOString(),
  };
};

/**
 * Calculate risk level based on permissions
 */
function calculateRiskLevel(scopes) {
  const highRiskScopes = [
    'Mail.ReadWrite',
    'Mail.Send',
    'Files.ReadWrite.All',
    'Directory.ReadWrite.All',
    'User.ReadWrite.All',
    'Application.ReadWrite.All',
    'RoleManagement.ReadWrite.Directory',
  ];

  const mediumRiskScopes = [
    'Mail.Read',
    'Files.Read.All',
    'Calendars.ReadWrite',
    'Contacts.ReadWrite',
    'Directory.Read.All',
    'User.Read.All',
  ];

  const hasHighRisk = scopes.some(s => highRiskScopes.includes(s));
  const hasMediumRisk = scopes.some(s => mediumRiskScopes.includes(s));

  if (hasHighRisk) return 'high';
  if (hasMediumRisk) return 'medium';
  return 'low';
}
