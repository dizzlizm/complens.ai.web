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

// Initialize services
let bedrockService;
let databaseService;
let secretsService;
let googleOAuthService;
let userManagementService;
let googleWorkspaceSecurityService;
let externalSecurityService;
let isInitialized = false;

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

    isInitialized = true;
    console.log('Services initialized successfully');
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
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
            'Access-Control-Allow-Origin': '*',
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
            'Access-Control-Allow-Origin': '*',
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

    // Route to appropriate handler
    let response;

    switch (true) {
      case path === '/health' && httpMethod === 'GET':
        response = await handleHealth();
        break;

      case path === '/chat' && httpMethod === 'POST':
        response = await handleChat(body);
        break;

      case path === '/conversations' && httpMethod === 'GET':
        response = await handleGetConversations();
        break;

      case path.startsWith('/conversations/') && httpMethod === 'GET':
        const conversationId = path.split('/')[2];
        response = await handleGetConversation(conversationId);
        break;

      case path === '/oauth/google/authorize' && httpMethod === 'GET':
        response = await handleGoogleOAuthAuthorize(event.queryStringParameters || {});
        break;

      case path === '/oauth/google/callback' && httpMethod === 'GET':
        response = await handleGoogleOAuthCallback(event.queryStringParameters || {});
        break;

      case path === '/oauth/google/disconnect' && httpMethod === 'POST':
        response = await handleGoogleOAuthDisconnect(body);
        break;

      case path === '/oauth/google/status' && httpMethod === 'GET':
        response = await handleGoogleOAuthStatus(event.queryStringParameters || {});
        break;

      case path === '/admin/users' && httpMethod === 'GET':
        response = await handleGetUsers(event.queryStringParameters || {});
        break;

      case path === '/admin/users' && httpMethod === 'POST':
        response = await handleCreateUser(body);
        break;

      case path.startsWith('/admin/users/') && httpMethod === 'PUT':
        const updateUserId = path.split('/')[3];
        response = await handleUpdateUser(updateUserId, body);
        break;

      case path.startsWith('/admin/users/') && httpMethod === 'DELETE':
        const deleteUserId = path.split('/')[3];
        response = await handleDeleteUser(deleteUserId, event.queryStringParameters || {});
        break;

      case path === '/security/users-without-2fa' && httpMethod === 'GET':
        response = await handleListUsersWithout2FA(event.queryStringParameters || {});
        break;

      case path === '/security/admin-accounts' && httpMethod === 'GET':
        response = await handleFindAdminAccounts(event.queryStringParameters || {});
        break;

      case path === '/security/external-sharing' && httpMethod === 'GET':
        response = await handleAnalyzeExternalSharing(event.queryStringParameters || {});
        break;

      case path === '/security/policies' && httpMethod === 'GET':
        response = await handleCheckSecurityPolicies(event.queryStringParameters || {});
        break;

      case path === '/security/summary' && httpMethod === 'GET':
        response = await handleGetSecuritySummary(event.queryStringParameters || {});
        break;

      case path === '/security/nist/search' && httpMethod === 'GET':
        response = await handleNISTSearch(event.queryStringParameters || {});
        break;

      case path.startsWith('/security/cve/') && httpMethod === 'GET':
        const cveId = path.split('/')[3];
        response = await handleCVELookup(cveId, event.queryStringParameters || {});
        break;

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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
 * Chat handler - sends message to Bedrock model (Nova or Claude)
 */
async function handleChat(body) {
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
      const conversation = await databaseService.getConversation(conversationId);
      conversationHistory = conversation.messages || [];
    }

    // Call Bedrock (uses chat model by default, security model for analysis)
    const response = await bedrockService.chat(message, conversationHistory);

    // Save conversation to database
    const savedConversation = await databaseService.saveConversation({
      conversationId,
      userMessage: message,
      assistantMessage: response.content,
      metadata: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        conversationId: savedConversation.id,
        response: response.content,
        usage: response.usage,
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
 * Get all conversations
 */
async function handleGetConversations() {
  try {
    const conversations = await databaseService.getConversations();

    return {
      statusCode: 200,
      body: JSON.stringify({
        conversations,
        count: conversations.length,
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
 * Get specific conversation by ID
 */
async function handleGetConversation(conversationId) {
  try {
    const conversation = await databaseService.getConversation(conversationId);

    if (!conversation) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Conversation not found' }),
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
async function handleGoogleOAuthAuthorize(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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
async function handleGoogleOAuthDisconnect(body) {
  try {
    const { orgId } = body;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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
async function handleGoogleOAuthStatus(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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
async function handleGetUsers(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

    const users = await userManagementService.listUsers(orgId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        users,
        count: users.length,
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
 * Create a new user
 */
async function handleCreateUser(body) {
  try {
    const { orgId, email, name, role, isActive, createdBy } = body;

    if (!orgId || !email || !name || !role) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['orgId', 'email', 'name', 'role'],
        }),
      };
    }

    const user = await userManagementService.createUser({
      orgId,
      email,
      name,
      role,
      isActive,
      createdBy,
    });

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'User created successfully',
        user,
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
async function handleUpdateUser(userId, body) {
  try {
    const { orgId, email, name, role, isActive, updatedBy } = body;

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

    const user = await userManagementService.updateUser(
      userId,
      orgId,
      { email, name, role, isActive },
      updatedBy
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'User updated successfully',
        user,
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
async function handleDeleteUser(userId, params) {
  try {
    const { orgId } = params;

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

async function handleListUsersWithout2FA(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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

async function handleFindAdminAccounts(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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

async function handleAnalyzeExternalSharing(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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

async function handleCheckSecurityPolicies(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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

async function handleGetSecuritySummary(params) {
  try {
    const { orgId } = params;

    if (!orgId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'orgId is required' }),
      };
    }

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
