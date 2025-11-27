/**
 * Complens.ai API Lambda Handler
 * Main entry point for API Gateway requests
 * Integrates with AWS Bedrock (Claude Sonnet 4) and PostgreSQL
 */

const { BedrockService } = require('./services/bedrock');
const { DatabaseService } = require('./services/database');
const { SecretsService } = require('./services/secrets');

// Initialize services
let bedrockService;
let databaseService;
let secretsService;
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
    // Initialize services if needed
    await initialize();

    // Parse request
    const httpMethod = event.httpMethod || event.requestContext?.http?.method;
    const path = event.path || event.requestContext?.http?.path;
    const body = event.body ? JSON.parse(event.body) : {};

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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...response.headers,
      },
    };

  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
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
 * Chat handler - sends message to Claude Sonnet 4 via Bedrock
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

    // Call Bedrock with Claude Sonnet 4
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
