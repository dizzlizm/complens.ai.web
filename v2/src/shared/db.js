/**
 * DynamoDB helpers with single-table design patterns
 *
 * Table Schema:
 * - PK: Partition key (e.g., USER#<userId>, CONN#<connectionId>)
 * - SK: Sort key (e.g., PROFILE, APP#<appId>)
 * - GSI1PK/GSI1SK: For reverse lookups
 *
 * Entity patterns:
 * - User: PK=USER#<sub>, SK=PROFILE
 * - Connection: PK=USER#<sub>, SK=CONN#<connId>
 * - OAuth App: PK=CONN#<connId>, SK=APP#<appId>
 * - Scan Result: PK=CONN#<connId>, SK=SCAN#<timestamp>
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TableName = process.env.TABLE_NAME;

// User operations
exports.getUser = async (userId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `USER#${userId}`, SK: 'PROFILE' },
  }));
  return result.Item;
};

exports.createUser = async (userId, email) => {
  const now = new Date().toISOString();
  const item = {
    PK: `USER#${userId}`,
    SK: 'PROFILE',
    GSI1PK: `EMAIL#${email.toLowerCase()}`,
    GSI1SK: `USER#${userId}`,
    userId,
    email,
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

// Connection operations (linked OAuth accounts)
exports.createConnection = async (userId, connection) => {
  const connectionId = connection.connectionId;
  const now = new Date().toISOString();
  const item = {
    PK: `USER#${userId}`,
    SK: `CONN#${connectionId}`,
    GSI1PK: `CONN#${connectionId}`,
    GSI1SK: `USER#${userId}`,
    connectionId,
    provider: connection.provider, // 'microsoft' | 'google'
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
    accessToken: connection.accessToken, // encrypted in prod
    refreshToken: connection.refreshToken,
    tokenExpiry: connection.tokenExpiry,
    scopes: connection.scopes,
    createdAt: now,
    lastScannedAt: null,
  };
  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

exports.getConnection = async (userId, connectionId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `USER#${userId}`, SK: `CONN#${connectionId}` },
  }));
  return result.Item;
};

exports.listConnections = async (userId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'CONN#',
    },
  }));
  return result.Items || [];
};

exports.deleteConnection = async (userId, connectionId) => {
  await docClient.send(new DeleteCommand({
    TableName,
    Key: { PK: `USER#${userId}`, SK: `CONN#${connectionId}` },
  }));
};

exports.updateConnectionTokens = async (userId, connectionId, tokens) => {
  await docClient.send(new UpdateCommand({
    TableName,
    Key: { PK: `USER#${userId}`, SK: `CONN#${connectionId}` },
    UpdateExpression: 'SET accessToken = :at, refreshToken = :rt, tokenExpiry = :te',
    ExpressionAttributeValues: {
      ':at': tokens.accessToken,
      ':rt': tokens.refreshToken,
      ':te': tokens.tokenExpiry,
    },
  }));
};

// OAuth App operations
exports.saveApps = async (connectionId, apps) => {
  // Batch write apps discovered from a scan
  const now = new Date().toISOString();

  for (const app of apps) {
    const item = {
      PK: `CONN#${connectionId}`,
      SK: `APP#${app.appId}`,
      GSI1PK: `APP#${app.appId}`,
      GSI1SK: `CONN#${connectionId}`,
      ...app,
      discoveredAt: now,
      updatedAt: now,
    };
    await docClient.send(new PutCommand({ TableName, Item: item }));
  }
};

exports.listApps = async (connectionId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `CONN#${connectionId}`,
      ':sk': 'APP#',
    },
  }));
  return result.Items || [];
};

// Scan history
exports.saveScan = async (connectionId, scanResult) => {
  const now = new Date().toISOString();
  const item = {
    PK: `CONN#${connectionId}`,
    SK: `SCAN#${now}`,
    ...scanResult,
    timestamp: now,
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
  };
  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};
