/**
 * DynamoDB helpers with single-table design for multi-tenant hierarchy
 *
 * Hierarchy:
 *   Organization → Properties → Connections → Apps
 *   Organization → Members (with roles)
 *
 * Entity patterns:
 *   User:        PK=USER#<sub>           SK=PROFILE
 *   Org:         PK=ORG#<orgId>          SK=PROFILE
 *   Member:      PK=ORG#<orgId>          SK=MEMBER#<userId>    GSI1: USER#<userId> | ORG#<orgId>
 *   Property:    PK=ORG#<orgId>          SK=PROP#<propId>
 *   Connection:  PK=PROP#<propId>        SK=CONN#<connId>      GSI1: CONN#<connId> | PROP#<propId>
 *   App:         PK=CONN#<connId>        SK=APP#<appId>
 *   Scan:        PK=CONN#<connId>        SK=SCAN#<timestamp>
 *
 * Roles: owner, admin, analyst, viewer
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TableName = process.env.TABLE_NAME;

const generateId = () => crypto.randomUUID();

// ============================================
// User operations (platform-level user profile)
// ============================================

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

exports.getOrCreateUser = async (userId, email) => {
  let user = await exports.getUser(userId);
  if (!user) {
    user = await exports.createUser(userId, email);
  }
  return user;
};

// ============================================
// Organization operations
// ============================================

exports.createOrganization = async (name, createdByUserId) => {
  const orgId = generateId();
  const now = new Date().toISOString();

  const org = {
    PK: `ORG#${orgId}`,
    SK: 'PROFILE',
    GSI1PK: 'ORG',
    GSI1SK: `ORG#${orgId}`,
    orgId,
    name,
    createdBy: createdByUserId,
    createdAt: now,
    updatedAt: now,
  };

  // Create org and add creator as owner in one transaction
  const member = {
    PK: `ORG#${orgId}`,
    SK: `MEMBER#${createdByUserId}`,
    GSI1PK: `USER#${createdByUserId}`,
    GSI1SK: `ORG#${orgId}`,
    orgId,
    userId: createdByUserId,
    role: 'owner',
    addedAt: now,
  };

  await docClient.send(new BatchWriteCommand({
    RequestItems: {
      [TableName]: [
        { PutRequest: { Item: org } },
        { PutRequest: { Item: member } },
      ],
    },
  }));

  return { ...org, members: [member] };
};

exports.getOrganization = async (orgId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: 'PROFILE' },
  }));
  return result.Item;
};

exports.listUserOrganizations = async (userId) => {
  // Get all orgs the user is a member of via GSI1
  const result = await docClient.send(new QueryCommand({
    TableName,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
    },
  }));

  // Fetch full org details for each membership
  const memberships = result.Items || [];
  const orgs = await Promise.all(
    memberships.map(async (m) => {
      const org = await exports.getOrganization(m.orgId);
      return { ...org, role: m.role };
    })
  );

  return orgs.filter(Boolean);
};

exports.updateOrganization = async (orgId, updates) => {
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: 'PROFILE' },
    UpdateExpression: 'SET #name = :name, updatedAt = :now',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: {
      ':name': updates.name,
      ':now': now,
    },
  }));
};

// ============================================
// Member operations (org membership + roles)
// ============================================

const ROLES = ['owner', 'admin', 'analyst', 'viewer'];
const ROLE_HIERARCHY = { owner: 4, admin: 3, analyst: 2, viewer: 1 };

exports.ROLES = ROLES;

exports.canManageRole = (actorRole, targetRole) => {
  // Can only manage roles below your level
  return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole];
};

exports.hasPermission = (role, permission) => {
  const permissions = {
    owner: ['*'],
    admin: ['manage_members', 'manage_properties', 'manage_connections', 'run_scans', 'view_results'],
    analyst: ['run_scans', 'view_results'],
    viewer: ['view_results'],
  };

  const rolePerms = permissions[role] || [];
  return rolePerms.includes('*') || rolePerms.includes(permission);
};

exports.addMember = async (orgId, userId, role, addedBy) => {
  if (!ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const now = new Date().toISOString();
  const item = {
    PK: `ORG#${orgId}`,
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `ORG#${orgId}`,
    orgId,
    userId,
    role,
    addedBy,
    addedAt: now,
  };

  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

exports.getMember = async (orgId, userId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${userId}` },
  }));
  return result.Item;
};

exports.listMembers = async (orgId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `ORG#${orgId}`,
      ':sk': 'MEMBER#',
    },
  }));
  return result.Items || [];
};

exports.updateMemberRole = async (orgId, userId, newRole) => {
  if (!ROLES.includes(newRole)) {
    throw new Error(`Invalid role: ${newRole}`);
  }

  await docClient.send(new UpdateCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${userId}` },
    UpdateExpression: 'SET #role = :role',
    ExpressionAttributeNames: { '#role': 'role' },
    ExpressionAttributeValues: { ':role': newRole },
  }));
};

exports.removeMember = async (orgId, userId) => {
  await docClient.send(new DeleteCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `MEMBER#${userId}` },
  }));
};

// ============================================
// Property operations (business units)
// ============================================

exports.createProperty = async (orgId, name, description = '') => {
  const propId = generateId();
  const now = new Date().toISOString();

  const item = {
    PK: `ORG#${orgId}`,
    SK: `PROP#${propId}`,
    GSI1PK: `PROP#${propId}`,
    GSI1SK: `ORG#${orgId}`,
    propId,
    orgId,
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

exports.getProperty = async (orgId, propId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `PROP#${propId}` },
  }));
  return result.Item;
};

exports.getPropertyById = async (propId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `PROP#${propId}`,
    },
  }));
  return result.Items?.[0];
};

exports.listProperties = async (orgId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `ORG#${orgId}`,
      ':sk': 'PROP#',
    },
  }));
  return result.Items || [];
};

exports.updateProperty = async (orgId, propId, updates) => {
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `PROP#${propId}` },
    UpdateExpression: 'SET #name = :name, description = :desc, updatedAt = :now',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: {
      ':name': updates.name,
      ':desc': updates.description || '',
      ':now': now,
    },
  }));
};

exports.deleteProperty = async (orgId, propId) => {
  await docClient.send(new DeleteCommand({
    TableName,
    Key: { PK: `ORG#${orgId}`, SK: `PROP#${propId}` },
  }));
};

// ============================================
// Connection operations (Microsoft tenants)
// ============================================

exports.createConnection = async (propId, connection) => {
  const connId = generateId();
  const now = new Date().toISOString();

  const item = {
    PK: `PROP#${propId}`,
    SK: `CONN#${connId}`,
    GSI1PK: `CONN#${connId}`,
    GSI1SK: `PROP#${propId}`,
    connId,
    propId,
    provider: connection.provider || 'microsoft',
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
    // For app-only auth (client credentials flow)
    clientId: connection.clientId,
    clientSecretArn: connection.clientSecretArn,
    status: 'active',
    createdAt: now,
    lastScannedAt: null,
  };

  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

exports.getConnection = async (connId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `CONN#${connId}`,
    },
  }));
  return result.Items?.[0];
};

exports.getConnectionByPropId = async (propId, connId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `PROP#${propId}`, SK: `CONN#${connId}` },
  }));
  return result.Item;
};

exports.listConnections = async (propId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `PROP#${propId}`,
      ':sk': 'CONN#',
    },
  }));
  return result.Items || [];
};

exports.updateConnectionScanTime = async (propId, connId) => {
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName,
    Key: { PK: `PROP#${propId}`, SK: `CONN#${connId}` },
    UpdateExpression: 'SET lastScannedAt = :now',
    ExpressionAttributeValues: { ':now': now },
  }));
};

exports.deleteConnection = async (propId, connId) => {
  await docClient.send(new DeleteCommand({
    TableName,
    Key: { PK: `PROP#${propId}`, SK: `CONN#${connId}` },
  }));
};

// ============================================
// OAuth App operations
// ============================================

exports.saveApps = async (connId, apps) => {
  const now = new Date().toISOString();

  // Batch write in groups of 25 (DynamoDB limit)
  const batches = [];
  for (let i = 0; i < apps.length; i += 25) {
    const batch = apps.slice(i, i + 25).map(app => ({
      PutRequest: {
        Item: {
          PK: `CONN#${connId}`,
          SK: `APP#${app.appId}`,
          GSI1PK: `APP#${app.appId}`,
          GSI1SK: `CONN#${connId}`,
          connId,
          ...app,
          discoveredAt: app.discoveredAt || now,
          updatedAt: now,
        },
      },
    }));
    batches.push(batch);
  }

  for (const batch of batches) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [TableName]: batch },
    }));
  }
};

exports.listApps = async (connId) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `CONN#${connId}`,
      ':sk': 'APP#',
    },
  }));
  return result.Items || [];
};

exports.getApp = async (connId, appId) => {
  const result = await docClient.send(new GetCommand({
    TableName,
    Key: { PK: `CONN#${connId}`, SK: `APP#${appId}` },
  }));
  return result.Item;
};

// ============================================
// Scan history
// ============================================

exports.saveScan = async (connId, scanResult) => {
  const now = new Date().toISOString();
  const item = {
    PK: `CONN#${connId}`,
    SK: `SCAN#${now}`,
    connId,
    ...scanResult,
    timestamp: now,
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days
  };

  await docClient.send(new PutCommand({ TableName, Item: item }));
  return item;
};

exports.listScans = async (connId, limit = 10) => {
  const result = await docClient.send(new QueryCommand({
    TableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `CONN#${connId}`,
      ':sk': 'SCAN#',
    },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return result.Items || [];
};
