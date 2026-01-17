/**
 * Complens.ai API Handler
 * Clean, minimal foundation for consumer privacy scanner
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE = process.env.TABLE_NAME;

// ============================================
// ROUTER
// ============================================

export const handler = async (event) => {
  const { routeKey, pathParameters, body, requestContext } = event;
  const userId = requestContext?.authorizer?.jwt?.claims?.sub;

  console.log('Request:', { routeKey, userId, pathParameters });

  try {
    // Public endpoints
    if (routeKey === 'GET /health') {
      return respond(200, { status: 'ok', timestamp: new Date().toISOString() });
    }

    // All other endpoints require auth
    if (!userId) {
      return respond(401, { error: 'Unauthorized' });
    }

    const parsed = body ? JSON.parse(body) : {};

    switch (routeKey) {
      // User profile
      case 'GET /me':
        return await getMe(userId);
      case 'PUT /me':
        return await updateMe(userId, parsed);

      // Connected accounts
      case 'GET /accounts':
        return await getAccounts(userId);
      case 'POST /accounts':
        return await createAccount(userId, parsed);
      case 'DELETE /accounts/{accountId}':
        return await deleteAccount(userId, pathParameters.accountId);

      // Discovered apps
      case 'GET /apps':
        return await getApps(userId);

      // Scans
      case 'POST /scan':
        return await startScan(userId, parsed);
      case 'GET /scan/{scanId}':
        return await getScanStatus(userId, pathParameters.scanId);

      // AI Chat
      case 'POST /chat':
        return await chat(userId, parsed);

      default:
        return respond(404, { error: 'Not found' });
    }
  } catch (err) {
    console.error('Error:', err);
    return respond(500, { error: 'Internal server error' });
  }
};

// ============================================
// USER PROFILE
// ============================================

async function getMe(userId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' }
  }));

  if (!result.Item) {
    // Auto-create profile on first access
    const profile = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      userId,
      createdAt: new Date().toISOString(),
      settings: {
        notifications: true,
        autoScan: false
      }
    };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: profile }));
    return respond(200, profile);
  }

  return respond(200, result.Item);
}

async function updateMe(userId, data) {
  const { settings, name } = data;

  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' }
  }));

  const profile = result.Item || {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    userId,
    createdAt: new Date().toISOString()
  };

  if (settings) profile.settings = { ...profile.settings, ...settings };
  if (name) profile.name = name;
  profile.updatedAt = new Date().toISOString();

  await ddb.send(new PutCommand({ TableName: TABLE, Item: profile }));
  return respond(200, profile);
}

// ============================================
// CONNECTED ACCOUNTS
// ============================================

async function getAccounts(userId) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'ACCOUNT#'
    }
  }));

  return respond(200, { accounts: result.Items || [] });
}

async function createAccount(userId, data) {
  const { platform, accessToken, refreshToken, email } = data;

  if (!platform || !accessToken) {
    return respond(400, { error: 'platform and accessToken required' });
  }

  const accountId = `${platform}_${Date.now()}`;
  const account = {
    PK: `USER#${userId}`,
    SK: `ACCOUNT#${accountId}`,
    GSI1PK: `PLATFORM#${platform}`,
    GSI1SK: `USER#${userId}`,
    accountId,
    platform,
    email,
    accessToken, // TODO: encrypt this
    refreshToken,
    status: 'connected',
    createdAt: new Date().toISOString(),
    lastScannedAt: null
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: account }));

  // Return without tokens
  const { accessToken: _, refreshToken: __, ...safe } = account;
  return respond(201, safe);
}

async function deleteAccount(userId, accountId) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: `USER#${userId}`, SK: `ACCOUNT#${accountId}` }
  }));

  // Also delete associated apps
  const apps = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': `APP#${accountId}`
    }
  }));

  for (const app of apps.Items || []) {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: app.PK, SK: app.SK }
    }));
  }

  return respond(200, { deleted: true });
}

// ============================================
// DISCOVERED APPS
// ============================================

async function getApps(userId) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'APP#'
    }
  }));

  return respond(200, { apps: result.Items || [] });
}

// ============================================
// SCANS
// ============================================

async function startScan(userId, data) {
  const { accountId } = data;

  // Get the account
  const accountResult = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `USER#${userId}`, SK: `ACCOUNT#${accountId}` }
  }));

  if (!accountResult.Item) {
    return respond(404, { error: 'Account not found' });
  }

  const scanId = `scan_${Date.now()}`;
  const scan = {
    PK: `USER#${userId}`,
    SK: `SCAN#${scanId}`,
    scanId,
    accountId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: scan }));

  // TODO: Trigger actual scan via SQS/Step Functions
  // For now, mark as complete with mock data
  scan.status = 'complete';
  scan.completedAt = new Date().toISOString();
  scan.summary = {
    appsFound: 0,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: scan }));

  return respond(202, scan);
}

async function getScanStatus(userId, scanId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `USER#${userId}`, SK: `SCAN#${scanId}` }
  }));

  if (!result.Item) {
    return respond(404, { error: 'Scan not found' });
  }

  return respond(200, result.Item);
}

// ============================================
// AI CHAT
// ============================================

async function chat(userId, data) {
  const { message } = data;

  if (!message) {
    return respond(400, { error: 'message required' });
  }

  // Get user context (accounts, apps)
  const [accountsResult, appsResult] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'ACCOUNT#' }
    })),
    ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'APP#' }
    }))
  ]);

  const accounts = accountsResult.Items || [];
  const apps = appsResult.Items || [];

  const systemPrompt = `You are Complens, a friendly AI assistant helping users understand and manage their digital privacy.

User context:
- Connected accounts: ${accounts.length} (${accounts.map(a => a.platform).join(', ') || 'none'})
- Third-party apps with access: ${apps.length}
- High risk apps: ${apps.filter(a => a.riskLevel === 'high').length}

Be helpful, concise, and actionable. If the user hasn't connected any accounts yet, encourage them to do so.
Focus on privacy and security. Explain risks in simple terms.`;

  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    return respond(200, {
      response: result.content[0].text,
      context: { accountCount: accounts.length, appCount: apps.length }
    });
  } catch (err) {
    console.error('Bedrock error:', err);
    return respond(200, {
      response: "I'm having trouble connecting to my brain right now. Please try again in a moment.",
      error: true
    });
  }
}

// ============================================
// HELPERS
// ============================================

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}
