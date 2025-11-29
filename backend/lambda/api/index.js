/**
 * Complens.ai API Lambda Handler
 * Main entry point for API Gateway requests
 * Integrates with AWS Bedrock (Claude Sonnet 4) and PostgreSQL
 */

const { BedrockService } = require('./services/bedrock');
const { DatabaseService } = require('./services/database');
const { SecretsService } = require('./services/secrets');
const { GoogleOAuthService } = require('./services/google-oauth');
const { UserManagementService } = require('./services/user-management');
const { GoogleWorkspaceSecurityService } = require('./services/google-workspace-security');
const { ExternalSecurityService } = require('./services/external-security');
const { ChromeWebStoreService } = require('./services/chrome-web-store');
const { TenantContextService } = require('./services/tenant-context');
const { AuditLoggerService } = require('./services/audit-logger');
const { getToolDefinitions, executeTool } = require('./services/tools');

// CORS Configuration - must match CloudFormation main.yaml
const ALLOWED_ORIGINS = [
  'https://dev.complens.ai',
  'http://localhost:3000',
];

// Initialize services
let bedrockService;
let databaseService;
let secretsService;
let googleOAuthService;
let userManagementService;
let googleWorkspaceSecurityService;
let externalSecurityService;
let chromeWebStoreService;
let tenantContextService;
let auditLoggerService;
let isInitialized = false;

/**
 * Extract user information from JWT claims (validated by API Gateway)
 * @param {object} event - Lambda event object
 * @returns {object|null} User info object or null if not authenticated
 */
function extractUserFromJWT(event) {
  try {
    // API Gateway JWT authorizer adds claims to requestContext
    const claims = event.requestContext?.authorizer?.jwt?.claims;

    if (!claims) {
      return null;
    }

    return {
      userId: claims.sub, // Cognito User ID (UUID)
      email: claims.email,
      emailVerified: claims.email_verified === 'true',
      username: claims['cognito:username'],
      name: claims.name,
    };
  } catch (error) {
    console.error('Error extracting user from JWT:', error);
    return null;
  }
}

/**
 * Extract tenant context for authenticated user
 * This looks up the user's organization mapping and validates access
 * @param {object} user - User object from JWT
 * @param {string} requestedOrgId - Optional org ID from request (for multi-org users)
 * @returns {Promise<object|null>} Tenant context with orgId and role, or null
 */
async function extractTenantContext(user, requestedOrgId = null) {
  if (!user || !user.userId) {
    console.warn('extractTenantContext: No user provided');
    return null;
  }

  try {
    // Get user's organizations
    const userOrgs = await tenantContextService.getUserOrganizations(user.userId, 'cognito');

    if (userOrgs.length === 0) {
      console.log(`User ${user.email} (${user.userId}) has no organization mapping. Auto-provisioning...`);

      try {
        // Auto-provision: Create organization for first-time user
        const result = await tenantContextService.createOrganizationWithOwner({
          name: `${user.name || user.email.split('@')[0]}'s Organization`,
          domain: user.email.split('@')[1] || 'example.com',
          userId: user.userId,
          authProvider: 'cognito',
          tier: 'free',
          settings: {},
          metadata: {
            email: user.email,
            name: user.name || user.email.split('@')[0],
            emailVerified: user.emailVerified
          }
        });

        console.log(`Auto-provisioned org ${result.organization.id} for user ${user.email}`);

        return {
          orgId: result.organization.id,
          role: 'owner',
          orgName: result.organization.name,
          orgTier: result.organization.tier,
          isPrimary: true
        };
      } catch (provisionError) {
        console.error('CRITICAL: Auto-provisioning failed:', provisionError);
        console.error('Stack:', provisionError.stack);

        // Don't return null - throw a descriptive error
        const error = new Error(`Failed to auto-provision organization: ${provisionError.message}`);
        error.statusCode = 500;
        throw error;
      }
    }

    // If specific org requested, validate user has access
    if (requestedOrgId) {
      const requestedOrg = userOrgs.find(org => org.org_id === requestedOrgId);
      if (!requestedOrg) {
        const error = new Error('Access denied: User does not belong to requested organization');
        error.statusCode = 403;
        throw error;
      }
      return {
        orgId: requestedOrg.org_id,
        role: requestedOrg.role,
        orgName: requestedOrg.org_name,
        orgTier: requestedOrg.org_tier,
        isPrimary: requestedOrg.is_primary
      };
    }

    // Return primary org (or first org if no primary set)
    const primaryOrg = userOrgs.find(org => org.is_primary) || userOrgs[0];
    return {
      orgId: primaryOrg.org_id,
      role: primaryOrg.role,
      orgName: primaryOrg.org_name,
      orgTier: primaryOrg.org_tier,
      isPrimary: primaryOrg.is_primary
    };

  } catch (error) {
    console.error('Error extracting tenant context:', error);

    // If it's a known error with statusCode, throw it
    if (error.statusCode) {
      throw error;
    }

    // Otherwise wrap in a generic error
    const wrappedError = new Error(`Tenant context error: ${error.message}`);
    wrappedError.statusCode = 500;
    throw wrappedError;
  }
}

/**
 * Require authentication middleware
 * Returns 401 if user is not authenticated
 */
function requireAuth(user) {
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Unauthorized',
        message: 'Authentication required. Please provide a valid JWT token.'
      })
    };
  }
  return null;
}

/**
 * Require tenant context middleware
 * Returns 403 if user doesn't have valid org mapping
 */
function requireTenantContext(tenantContext) {
  if (!tenantContext || !tenantContext.orgId) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: 'Forbidden',
        message: 'No organization access. Please contact support.'
      })
    };
  }
  return null;
}

/**
 * Get allowed origin for CORS response
 * When credentials are enabled, we CANNOT use wildcard '*'
 * @param {object} event - Lambda event object
 * @returns {string} Allowed origin or default origin
 */
function getAllowedOrigin(event) {
  // Get origin from request headers (case-insensitive)
  const origin = event.headers?.origin || event.headers?.Origin;

  // Check if origin is in allowed list
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }

  // Check if origin matches CloudFront pattern (*.cloudfront.net)
  if (origin && origin.match(/^https:\/\/[a-z0-9]+\.cloudfront\.net$/)) {
    return origin;
  }

  // Default to first allowed origin (for non-browser requests or when origin not provided)
  return ALLOWED_ORIGINS[0];
}

/**
 * Initialize services (outside handler for Lambda container reuse)
 */
async function initialize() {
  if (isInitialized) return;

  try {
    console.log('Initializing services...');

    // Initialize secrets service
    secretsService = new SecretsService(process.env.SECRETS_ARN);
    const secrets = await secretsService.getSecrets();

    // Initialize Bedrock service
    bedrockService = new BedrockService(process.env.REGION || 'us-east-1');

    // Initialize database service
    databaseService = new DatabaseService({
      host: secrets.dbHost,
      port: secrets.dbPort,
      database: secrets.dbName,
      user: secrets.dbUsername,
      password: secrets.dbPassword,
    });

    // Set Google OAuth credentials as environment variables (if they exist)
    if (secrets.googleClientId && secrets.googleClientSecret) {
      process.env.GOOGLE_CLIENT_ID = secrets.googleClientId;
      process.env.GOOGLE_CLIENT_SECRET = secrets.googleClientSecret;
      process.env.GOOGLE_REDIRECT_URI = secrets.googleRedirectUri;
      process.env.FRONTEND_URL = secrets.frontendUrl;
      console.log('Google OAuth credentials loaded from Secrets Manager');
    } else {
      console.warn('Google OAuth credentials not found in Secrets Manager');
    }

    // Initialize Google OAuth service
    googleOAuthService = new GoogleOAuthService();

    // Initialize User Management service
    userManagementService = new UserManagementService(databaseService);

    // Initialize Google Workspace Security service
    googleWorkspaceSecurityService = new GoogleWorkspaceSecurityService(databaseService);

    // Initialize External Security Intelligence service
    externalSecurityService = new ExternalSecurityService(databaseService);

    // Initialize Chrome Web Store service
    chromeWebStoreService = new ChromeWebStoreService(databaseService);

    // Initialize Tenant Context service
    tenantContextService = new TenantContextService(databaseService);

    // Initialize Audit Logger service
    auditLoggerService = new AuditLoggerService(databaseService);

    isInitialized = true;
    console.log('Services initialized successfully (including tenant context and audit logging)');
  } catch (error) {
    console.error('Error initializing services:', error);
    throw error;
  }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Parse request
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    let path = event.rawPath || event.path || event.requestContext?.http?.path;

    // Strip stage prefix from path (e.g., /dev/chat -> /chat)
    // API Gateway includes stage in path for HTTP API v2
    const stage = event.requestContext?.stage;
    if (stage && path.startsWith(`/${stage}/`)) {
      path = path.substring(`/${stage}`.length);
    }

    // Handle CORS preflight OPTIONS requests (no initialization needed)
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': getAllowedOrigin(event),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400', // Cache preflight for 24 hours
          'Cache-Control': 'public, max-age=86400', // Cache preflight responses
        },
        body: '',
      };
    }

    // Parse body (handle non-JSON gracefully)
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (parseError) {
        console.warn('Failed to parse body as JSON:', parseError);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getAllowedOrigin(event),
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({ error: 'Invalid JSON in request body' }),
        };
      }
    }

    // Initialize services if needed (after OPTIONS check)
    try {
      await initialize();
    } catch (initError) {
      console.error('Service initialization failed:', initError);

      // Allow health check to work even if initialization fails
      if (path === '/health' && httpMethod === 'GET') {
        return {
          statusCode: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': getAllowedOrigin(event),
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({
            status: 'unavailable',
            message: 'Services are initializing',
            error: initError.message,
          }),
        };
      }

      // For other routes, initialization is required
      throw initError;
    }

    // Extract user information from JWT (if authenticated)
    const user = extractUserFromJWT(event);

    // Log user info for debugging (remove in production)
    if (user) {
      console.log('Authenticated user:', { userId: user.userId, email: user.email });
    } else {
      console.log('Unauthenticated request');
    }

    // Route to appropriate handler
    let response;

    switch (true) {
      case path === '/health' && httpMethod === 'GET':
        response = await handleHealth();
        break;

      case path === '/debug/me' && httpMethod === 'GET': {
        // Debug endpoint - shows user info and tenant status (NO auth required for debugging)
        response = await handleDebugMe(event, user);
        break;
      }

      case path === '/chat' && httpMethod === 'POST': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        try {
          const tenantContext = await extractTenantContext(user, body.orgId);
          const tenantError = requireTenantContext(tenantContext);
          if (tenantError) {
            response = tenantError;
            break;
          }
          response = await handleChat(body, user, tenantContext, event);
        } catch (tenantError) {
          response = {
            statusCode: tenantError.statusCode || 500,
            body: JSON.stringify({
              error: 'Tenant context error',
              message: tenantError.message
            })
          };
        }
        break;
      }

      case path === '/conversations' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        try {
          const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
          const tenantError = requireTenantContext(tenantContext);
          if (tenantError) {
            response = tenantError;
            break;
          }
          response = await handleGetConversations(user, tenantContext);
        } catch (tenantError) {
          response = {
            statusCode: tenantError.statusCode || 500,
            body: JSON.stringify({
              error: 'Tenant context error',
              message: tenantError.message
            })
          };
        }
        break;
      }

      case path.startsWith('/conversations/') && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const conversationId = path.split('/')[2];
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGetConversation(conversationId, user, tenantContext);
        break;
      }

      case path === '/oauth/google/authorize' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGoogleOAuthAuthorize(tenantContext);
        break;
      }

      case path === '/oauth/google/callback' && httpMethod === 'GET':
        response = await handleGoogleOAuthCallback(event.queryStringParameters || {});
        break;

      case path === '/oauth/google/disconnect' && httpMethod === 'POST': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, body?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGoogleOAuthDisconnect(tenantContext);
        break;
      }

      case path === '/oauth/google/status' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGoogleOAuthStatus(tenantContext);
        break;
      }

      case path === '/admin/users' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGetUsers(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/admin/users' && httpMethod === 'POST': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, body.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleCreateUser(body, tenantContext, user);
        break;
      }

      case path.startsWith('/admin/users/') && httpMethod === 'PUT': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const updateUserId = path.split('/')[3];
        const tenantContext = await extractTenantContext(user, body.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleUpdateUser(updateUserId, body, tenantContext, user);
        break;
      }

      case path.startsWith('/admin/users/') && httpMethod === 'DELETE': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const deleteUserId = path.split('/')[3];
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleDeleteUser(deleteUserId, event.queryStringParameters || {}, tenantContext, user);
        break;
      }

      case path === '/security/users-without-2fa' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleListUsersWithout2FA(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/security/admin-accounts' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleFindAdminAccounts(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/security/external-sharing' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleAnalyzeExternalSharing(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/security/policies' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleCheckSecurityPolicies(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/security/summary' && httpMethod === 'GET': {
        const authError = requireAuth(user);
        if (authError) {
          response = authError;
          break;
        }
        const tenantContext = await extractTenantContext(user, event.queryStringParameters?.orgId);
        const tenantError = requireTenantContext(tenantContext);
        if (tenantError) {
          response = tenantError;
          break;
        }
        response = await handleGetSecuritySummary(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path === '/security/nist/search' && httpMethod === 'GET': {
        // NIST search can be public or authenticated - keep flexible for now
        const tenantContext = user ? await extractTenantContext(user, event.queryStringParameters?.orgId) : null;
        response = await handleNISTSearch(event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path.startsWith('/security/cve/') && httpMethod === 'GET': {
        // CVE lookup can be public or authenticated - keep flexible for now
        const cveId = path.split('/')[3];
        const tenantContext = user ? await extractTenantContext(user, event.queryStringParameters?.orgId) : null;
        response = await handleCVELookup(cveId, event.queryStringParameters || {}, tenantContext);
        break;
      }

      case path.startsWith('/security/chrome-extension/') && httpMethod === 'GET': {
        // Extension lookup can be public or authenticated - keep flexible for now
        const extensionId = path.split('/')[3];
        const tenantContext = user ? await extractTenantContext(user, event.queryStringParameters?.orgId) : null;
        response = await handleChromeExtensionLookup(extensionId, event.queryStringParameters || {}, tenantContext);
        break;
      }

      default:
        response = {
          statusCode: 404,
          body: JSON.stringify({ error: 'Not found' }),
        };
    }

    // Add CORS headers
    return {
      ...response,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getAllowedOrigin(event),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Don't cache API responses
        ...response.headers,
      },
    };

  } catch (error) {
    console.error('Error processing request:', error);
    console.error('Error stack:', error.stack);

    // Include more debugging info in dev environment
    const isDev = process.env.ENVIRONMENT === 'dev';

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getAllowedOrigin(event),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        ...(isDev && { stack: error.stack, name: error.name }),
      }),
    };
  }
};

/**
 * Health check handler
 */
async function handleHealth() {
  try {
    // Check database connection
    await databaseService.query('SELECT 1');

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          bedrock: 'available',
        },
      }),
    };
  } catch (error) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        status: 'unhealthy',
        error: error.message,
      }),
    };
  }
}

/**
 * Debug endpoint to check user and tenant status
 */
async function handleDebugMe(event, user) {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      jwt: {
        present: !!event.requestContext?.authorizer?.jwt,
        claims: event.requestContext?.authorizer?.jwt?.claims || null
      },
      user: user || null,
      requestContext: {
        requestId: event.requestContext?.requestId,
        stage: event.requestContext?.stage,
        path: event.requestContext?.http?.path
      }
    };

    // Try to get tenant context
    if (user) {
      try {
        const userOrgs = await tenantContextService.getUserOrganizations(user.userId, 'cognito');
        debugInfo.tenantStatus = {
          hasOrganizations: userOrgs.length > 0,
          organizationCount: userOrgs.length,
          organizations: userOrgs.map(org => ({
            orgId: org.org_id,
            orgName: org.org_name,
            role: org.role,
            isPrimary: org.is_primary,
            tier: org.org_tier,
            status: org.org_status
          }))
        };

        // Try auto-provisioning check
        if (userOrgs.length === 0) {
          debugInfo.tenantStatus.message = 'No organizations found - auto-provision will trigger on first API call';
        }
      } catch (tenantError) {
        debugInfo.tenantStatus = {
          error: tenantError.message,
          stack: tenantError.stack
        };
      }

      // Check if migration tables exist
      try {
        const tablesCheck = await databaseService.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('user_organizations', 'organizations', 'conversations')
          ORDER BY table_name
        `);
        debugInfo.databaseTables = {
          found: tablesCheck.rows.map(r => r.table_name),
          migrationStatus: tablesCheck.rows.length === 3 ? 'complete' : 'incomplete'
        };
      } catch (dbError) {
        debugInfo.databaseTables = {
          error: dbError.message
        };
      }
    } else {
      debugInfo.tenantStatus = {
        message: 'User not authenticated - JWT token missing or invalid'
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(debugInfo, null, 2),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Debug endpoint failed',
        message: error.message,
        stack: error.stack
      }, null, 2),
    };
  }
}

/**
 * Chat handler - sends message to Bedrock model (Nova or Claude)
 */
async function handleChat(body, user, tenantContext, event) {
  const { message, conversationId } = body;

  if (!message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Message is required' }),
    };
  }

  try {
    // Get conversation history if conversationId provided
    let conversationHistory = [];
    if (conversationId) {
      // Validate conversation belongs to user's organization
      const conversation = await databaseService.getConversation(conversationId, tenantContext.orgId);

      if (!conversation) {
        // Log unauthorized access attempt
        await auditLoggerService.logUnauthorized({
          ...AuditLoggerService.createAuditContext(event, user, tenantContext.orgId),
          action: 'conversation.access',
          resourceType: 'conversation',
          resourceId: conversationId,
          errorMessage: 'Conversation not found or access denied'
        });

        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'Access denied to this conversation' }),
        };
      }

      // Verify conversation belongs to user (double check)
      if (conversation.user_id && conversation.user_id !== user.userId) {
        await auditLoggerService.logUnauthorized({
          ...AuditLoggerService.createAuditContext(event, user, tenantContext.orgId),
          action: 'conversation.access',
          resourceType: 'conversation',
          resourceId: conversationId,
          errorMessage: 'User does not own this conversation'
        });

        return {
          statusCode: 403,
          body: JSON.stringify({ error: 'Access denied to this conversation' }),
        };
      }

      conversationHistory = conversation.messages || [];
    }

    // Get security intelligence tools
    const tools = getToolDefinitions();

    // Enhanced system prompt for security intelligence
    const systemPrompt = `You are a security intelligence assistant built by Complens.ai. You help analyze security risks, vulnerabilities, browser extensions, and other security concerns.

When a user asks about security topics, you should:
1. Use available tools to gather factual security intelligence
2. Provide evidence-based security assessments
3. Cite specific CVEs, versions, and security reports when available
4. Give actionable recommendations for enterprise security

Available tools:
- chrome_extension_lookup: Analyze Chrome extensions for security risks
- search_vulnerabilities: Search NIST NVD for CVEs and vulnerabilities
- get_vulnerability_intelligence: Get detailed information about specific CVEs including NIST, CISA, and EPSS data
- check_exploitation_status: Check if a CVE is in CISA's Known Exploited Vulnerabilities catalog
- predict_exploitability: Get EPSS probability score for a CVE

Use these tools proactively when users ask about security topics.`;

    // Use the agentic chat loop with intelligent tool execution
    const response = await bedrockService.agentChat(message, conversationHistory, {
      tools,
      systemPrompt,
      temperature: 0.7,
      maxLoops: 10,
      returnSteps: false, // Set to true if you want to track execution steps for debugging
      services: {
        chromeWebStoreService,
        externalSecurityService,
        bedrockService,
      }
    });

    const totalInputTokens = response.usage?.input_tokens || 0;
    const totalOutputTokens = response.usage?.output_tokens || 0;

    // Save conversation to database (only save final user message and assistant response)
    const savedConversation = await databaseService.saveConversation({
      conversationId,
      userId: user?.userId,
      orgId: tenantContext.orgId, // Critical: Associate with organization
      userMessage: message,
      assistantMessage: response.content,
      metadata: {
        model: bedrockService.getModelId(),
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolsUsed: response.iterations > 1, // Track if tools were used
        toolIterations: response.iterations - 1,
        stopReason: response.stopReason,
      },
    });

    // Audit log the chat interaction
    await auditLoggerService.logSuccess({
      ...AuditLoggerService.createAuditContext(event, user, tenantContext.orgId),
      action: conversationId ? 'conversation.message' : 'conversation.create',
      resourceType: 'conversation',
      resourceId: savedConversation.id,
      metadata: {
        messageLength: message.length,
        tokensUsed: totalInputTokens + totalOutputTokens
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        conversationId: savedConversation.id,
        response: response.content,
        usage: {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
          total_tokens: totalInputTokens + totalOutputTokens,
        },
      }),
    };

  } catch (error) {
    console.error('Error in chat handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to process chat message',
        message: error.message,
      }),
    };
  }
}

/**
 * Get all conversations (filtered by org and user)
 */
async function handleGetConversations(user, tenantContext) {
  try {
    // Get conversations for the authenticated user within their organization
    const conversations = await databaseService.getConversations(
      user.userId,
      tenantContext.orgId
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        conversations,
        count: conversations.length,
        organization: {
          id: tenantContext.orgId,
          name: tenantContext.orgName,
          tier: tenantContext.orgTier
        }
      }),
    };

  } catch (error) {
    console.error('Error getting conversations:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get conversations',
        message: error.message,
      }),
    };
  }
}

/**
 * Get specific conversation by ID (with org validation)
 */
async function handleGetConversation(conversationId, user, tenantContext) {
  try {
    // Get conversation with org_id validation
    const conversation = await databaseService.getConversation(conversationId, tenantContext.orgId);

    if (!conversation) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found or access denied' }),
      };
    }

    // Verify conversation belongs to user (double check)
    if (conversation.user_id && conversation.user_id !== user.userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Access denied to this conversation' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(conversation),
    };

  } catch (error) {
    console.error('Error getting conversation:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get conversation',
        message: error.message,
      }),
    };
  }
}

/**
 * Google OAuth Authorization - Step 1
 * Redirects user to Google consent screen
 */
async function handleGoogleOAuthAuthorize(tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    // Generate state parameter (used to prevent CSRF and track org)
    const state = Buffer.from(JSON.stringify({ orgId, timestamp: Date.now() })).toString('base64');

    // Get authorization URL
    const authUrl = googleOAuthService.getAuthorizationUrl(state);

    // Redirect to Google consent screen
    return {
      statusCode: 302,
      headers: {
        Location: authUrl,
      },
      body: '',
    };

  } catch (error) {
    console.error('Error in OAuth authorize:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to initialize OAuth flow',
        message: error.message,
      }),
    };
  }
}

/**
 * Google OAuth Callback - Step 2
 * Handles redirect from Google after user approves/denies
 */
async function handleGoogleOAuthCallback(params) {
  try {
    const { code, state, error } = params;

    // User denied access
    if (error) {
      return {
        statusCode: 302,
        headers: {
          Location: `${process.env.FRONTEND_URL}/oauth/callback?success=false&error=${encodeURIComponent(error)}`,
        },
        body: '',
      };
    }

    if (!code || !state) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing code or state parameter' }),
      };
    }

    // Decode state to get orgId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { orgId } = stateData;

    // Exchange code for tokens
    const tokens = await googleOAuthService.getTokens(code);

    // Get user info
    const userInfo = await googleOAuthService.getUserInfo(tokens.access_token);

    // Store tokens in database
    await databaseService.query(
      `INSERT INTO google_workspace_connections (org_id, access_token, refresh_token, token_expiry, connected_email, connected_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (org_id)
       DO UPDATE SET
         access_token = $2,
         refresh_token = $3,
         token_expiry = $4,
         connected_email = $5,
         connected_at = NOW(),
         disconnected_at = NULL`,
      [
        orgId,
        tokens.access_token,
        tokens.refresh_token,
        new Date(Date.now() + tokens.expiry_date),
        userInfo.email,
      ]
    );

    // Redirect back to frontend with success
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.FRONTEND_URL}/oauth/callback?success=true&email=${encodeURIComponent(userInfo.email)}`,
      },
      body: '',
    };

  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.FRONTEND_URL}/oauth/callback?success=false&error=${encodeURIComponent('Authentication failed: ' + error.message)}`,
      },
      body: '',
    };
  }
}

/**
 * Disconnect Google Workspace
 */
async function handleGoogleOAuthDisconnect(tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    // Get current tokens
    const result = await databaseService.query(
      'SELECT access_token FROM google_workspace_connections WHERE org_id = $1',
      [orgId]
    );

    if (result.rows.length > 0) {
      // Revoke tokens with Google
      try {
        await googleOAuthService.revokeTokens(result.rows[0].access_token);
      } catch (revokeError) {
        console.error('Error revoking tokens:', revokeError);
        // Continue anyway to mark as disconnected
      }
    }

    // Mark as disconnected in database
    await databaseService.query(
      'UPDATE google_workspace_connections SET disconnected_at = NOW() WHERE org_id = $1',
      [orgId]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Google Workspace disconnected successfully' }),
    };

  } catch (error) {
    console.error('Error disconnecting Google Workspace:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to disconnect',
        message: error.message,
      }),
    };
  }
}

/**
 * Check Google Workspace connection status
 */
async function handleGoogleOAuthStatus(tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await databaseService.query(
      `SELECT connected_email, connected_at, disconnected_at, token_expiry
       FROM google_workspace_connections
       WHERE org_id = $1 AND disconnected_at IS NULL`,
      [orgId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          connected: false,
        }),
      };
    }

    const connection = result.rows[0];
    const isExpired = new Date(connection.token_expiry) < new Date();

    return {
      statusCode: 200,
      body: JSON.stringify({
        connected: true,
        email: connection.connected_email,
        connectedAt: connection.connected_at,
        tokenExpired: isExpired,
      }),
    };

  } catch (error) {
    console.error('Error checking OAuth status:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to check status',
        message: error.message,
      }),
    };
  }
}

/**
 * Get all users for an organization
 */
/**
 * Get users in organization (shows both Cognito users and local DB users)
 */
async function handleGetUsers(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    // Get Cognito users (from user_organizations table)
    const cognitoUsers = await tenantContextService.getOrganizationUsers(orgId);

    // Get local database users (from admin_users table)
    const localUsers = await userManagementService.listUsers(orgId);

    // Combine and format
    const allUsers = [
      ...cognitoUsers.map(u => ({
        id: u.user_id,
        email: u.metadata?.email || 'N/A',
        name: u.metadata?.name || 'N/A',
        role: u.role,
        authProvider: u.auth_provider,
        isActive: true,
        createdAt: u.created_at,
        isPrimary: u.is_primary
      })),
      ...localUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        authProvider: 'local',
        isActive: u.is_active,
        createdAt: u.created_at,
        isPrimary: false
      }))
    ];

    return {
      statusCode: 200,
      body: JSON.stringify({
        users: allUsers,
        count: allUsers.length,
        organization: {
          id: orgId,
          name: tenantContext.orgName,
          tier: tenantContext.orgTier
        },
        breakdown: {
          cognito: cognitoUsers.length,
          local: localUsers.length
        }
      }),
    };

  } catch (error) {
    console.error('Error getting users:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get users',
        message: error.message,
      }),
    };
  }
}

/**
 * Create a new user (local database user, not Cognito)
 */
async function handleCreateUser(body, tenantContext, user) {
  try {
    const orgId = tenantContext.orgId;
    const { email, name, role, isActive } = body;

    if (!email || !name || !role) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['email', 'name', 'role'],
        }),
      };
    }

    // Only owners and admins can create users
    if (!['owner', 'admin'].includes(tenantContext.role)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Insufficient permissions',
          message: 'Only owners and admins can create users'
        }),
      };
    }

    const newUser = await userManagementService.createUser({
      orgId,
      email,
      name,
      role,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: user.userId,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Local database user created successfully',
        user: newUser,
      }),
    };

  } catch (error) {
    console.error('Error creating user:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to create user',
        message: error.message,
      }),
    };
  }
}

/**
 * Update a user
 */
async function handleUpdateUser(userId, body, tenantContext, currentUser) {
  try {
    const orgId = tenantContext.orgId;
    const { email, name, role, isActive } = body;

    // Only owners and admins can update users
    if (!['owner', 'admin'].includes(tenantContext.role)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Insufficient permissions',
          message: 'Only owners and admins can update users'
        }),
      };
    }

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    const updatedUser = await userManagementService.updateUser(
      userId,
      orgId,
      { email, name, role, isActive },
      currentUser.userId
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User updated successfully',
        user: updatedUser,
      }),
    };

  } catch (error) {
    console.error('Error updating user:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to update user',
        message: error.message,
      }),
    };
  }
}

/**
 * Delete a user
 */
async function handleDeleteUser(userId, params, tenantContext, currentUser) {
  try {
    const orgId = tenantContext.orgId;

    // Only owners and admins can delete users
    if (!['owner', 'admin'].includes(tenantContext.role)) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Insufficient permissions',
          message: 'Only owners and admins can delete users'
        }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    // Prevent self-deletion
    if (userId === currentUser.userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Cannot delete yourself',
          message: 'You cannot delete your own user account'
        }),
      };
    }

    const result = await userManagementService.deleteUser(userId, orgId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User deleted successfully',
        ...result,
      }),
    };

  } catch (error) {
    console.error('Error deleting user:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Failed to delete user',
        message: error.message,
      }),
    };
  }
}

/**
 * Google Workspace Security Analysis Handlers
 */

async function handleListUsersWithout2FA(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await googleWorkspaceSecurityService.listUsersWithoutTwoFactor(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error listing users without 2FA:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to list users without 2FA',
        message: error.message,
      }),
    };
  }
}

async function handleFindAdminAccounts(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await googleWorkspaceSecurityService.findAdminAccounts(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error finding admin accounts:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to find admin accounts',
        message: error.message,
      }),
    };
  }
}

async function handleAnalyzeExternalSharing(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await googleWorkspaceSecurityService.analyzeExternalSharing(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error analyzing external sharing:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to analyze external sharing',
        message: error.message,
      }),
    };
  }
}

async function handleCheckSecurityPolicies(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await googleWorkspaceSecurityService.checkSecurityPolicies(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error checking security policies:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to check security policies',
        message: error.message,
      }),
    };
  }
}

async function handleGetSecuritySummary(params, tenantContext) {
  try {
    const orgId = tenantContext.orgId;

    const result = await googleWorkspaceSecurityService.getSecuritySummary(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error getting security summary:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to get security summary',
        message: error.message,
      }),
    };
  }
}

/**
 * External Security Intelligence Handlers
 */

async function handleNISTSearch(params) {
  try {
    const { keyword, limit, useCache, orgId } = params;

    if (!keyword) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'keyword parameter is required' }),
      };
    }

    // Fetch from NIST (with caching)
    const result = await externalSecurityService.searchNIST(keyword, {
      limit: parseInt(limit) || 10,
      useCache: useCache !== 'false',
      orgId,
    });

    // If not cached and no AI analysis yet, generate it
    if (!result.cached && !result.aiAnalysis && result.results.length > 0) {
      const analysis = await externalSecurityService.analyzeWithAI(result.results, bedrockService);

      // Update cache with AI analysis
      await externalSecurityService.updateAIAnalysis('nist', 'keyword', keyword, analysis, orgId);

      result.aiAnalysis = analysis;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error searching NIST:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to search NIST NVD',
        message: error.message,
      }),
    };
  }
}

async function handleCVELookup(cveId, params) {
  try {
    if (!cveId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'CVE ID is required' }),
      };
    }

    const { useCache, orgId } = params;

    // Fetch CVE details (with caching)
    const result = await externalSecurityService.getCVEDetails(cveId, {
      useCache: useCache !== 'false',
      orgId,
    });

    // If not cached and no AI analysis yet, generate it
    if (!result.cached && !result.aiAnalysis) {
      const analysis = await externalSecurityService.analyzeWithAI(result, bedrockService);

      // Update cache with AI analysis
      await externalSecurityService.updateAIAnalysis('nist', 'cve_id', cveId.toUpperCase(), analysis, orgId);

      result.aiAnalysis = analysis;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error looking up CVE:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to lookup CVE',
        message: error.message,
      }),
    };
  }
}

async function handleChromeExtensionLookup(extensionId, params) {
  try {
    if (!extensionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Extension ID is required' }),
      };
    }

    const { useCache, orgId } = params;

    // Fetch extension details (with caching)
    const result = await chromeWebStoreService.getExtension(extensionId, {
      useCache: useCache !== 'false',
      orgId,
    });

    // If not cached and no AI analysis yet, generate it
    if (!result.cached && !result.aiAnalysis && result.name) {
      const analysis = await chromeWebStoreService.analyzeExtensionSecurity(result, bedrockService);

      // Update cache with AI analysis
      await chromeWebStoreService.updateAIAnalysis('chrome_store', 'extension_id', extensionId, analysis, orgId);

      result.aiAnalysis = analysis;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('Error looking up Chrome extension:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to lookup Chrome extension',
        message: error.message,
      }),
    };
  }
}
