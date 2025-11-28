#!/usr/bin/env node

/**
 * Google Workspace Security MCP Server
 *
 * This MCP server provides security analysis tools for Google Workspace:
 * - User enumeration and 2FA status
 * - Admin account analysis
 * - External sharing detection
 * - Group membership analysis
 * - Security policy evaluation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

// Initialize Google Workspace Admin SDK
let adminClient = null;

/**
 * Initialize Google Workspace Admin SDK with service account credentials
 */
async function initializeGoogleClient() {
  if (adminClient) return adminClient;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.group.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    });

    adminClient = google.admin({
      version: 'directory_v1',
      auth,
    });

    return adminClient;
  } catch (error) {
    console.error('Failed to initialize Google client:', error);
    throw error;
  }
}

/**
 * Security Analysis Tools
 */

async function listUsersWithoutTwoFactor() {
  const admin = await initializeGoogleClient();

  try {
    const response = await admin.users.list({
      customer: 'my_customer',
      maxResults: 500,
      orderBy: 'email',
      projection: 'full',
    });

    const users = response.data.users || [];
    const usersWithout2FA = users.filter(user => {
      const has2FA = user.isEnrolledIn2Sv === true;
      return !has2FA && !user.suspended;
    });

    // Store findings in database
    for (const user of usersWithout2FA) {
      await pool.query(
        `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         ON CONFLICT DO NOTHING`,
        [
          process.env.ORG_ID,
          'missing_2fa',
          user.isAdmin ? 'critical' : 'high',
          user.primaryEmail,
          `User ${user.primaryEmail} does not have 2FA enabled`,
          JSON.stringify({
            isAdmin: user.isAdmin,
            lastLoginTime: user.lastLoginTime,
            creationTime: user.creationTime,
          }),
        ]
      );
    }

    return {
      total: users.length,
      without2FA: usersWithout2FA.length,
      users: usersWithout2FA.map(u => ({
        email: u.primaryEmail,
        name: u.name?.fullName,
        isAdmin: u.isAdmin,
        lastLogin: u.lastLoginTime,
        suspended: u.suspended,
      })),
    };
  } catch (error) {
    console.error('Error listing users without 2FA:', error);
    throw error;
  }
}

async function findAdminAccounts() {
  const admin = await initializeGoogleClient();

  try {
    const response = await admin.users.list({
      customer: 'my_customer',
      maxResults: 500,
      query: 'isAdmin=true',
      projection: 'full',
    });

    const admins = response.data.users || [];

    return {
      totalAdmins: admins.length,
      admins: admins.map(admin => ({
        email: admin.primaryEmail,
        name: admin.name?.fullName,
        has2FA: admin.isEnrolledIn2Sv,
        lastLogin: admin.lastLoginTime,
        suspended: admin.suspended,
        superAdmin: admin.isAdmin && admin.isDelegatedAdmin === false,
      })),
    };
  } catch (error) {
    console.error('Error finding admin accounts:', error);
    throw error;
  }
}

async function analyzeExternalSharing() {
  const admin = await initializeGoogleClient();
  const drive = google.drive({ version: 'v3', auth: admin });

  try {
    // List files shared with external users
    const response = await drive.files.list({
      q: "visibility='anyoneWithLink' or visibility='anyoneCanFind'",
      fields: 'files(id,name,mimeType,webViewLink,owners,permissions,shared)',
      pageSize: 100,
    });

    const externalFiles = response.data.files || [];

    // Store findings
    for (const file of externalFiles) {
      await pool.query(
        `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         ON CONFLICT DO NOTHING`,
        [
          process.env.ORG_ID,
          'external_sharing',
          'medium',
          file.id,
          `File "${file.name}" is shared externally`,
          JSON.stringify({
            name: file.name,
            mimeType: file.mimeType,
            link: file.webViewLink,
            owners: file.owners,
          }),
        ]
      );
    }

    return {
      totalExternalFiles: externalFiles.length,
      files: externalFiles.map(f => ({
        name: f.name,
        type: f.mimeType,
        link: f.webViewLink,
        owners: f.owners?.map(o => o.emailAddress),
      })),
    };
  } catch (error) {
    console.error('Error analyzing external sharing:', error);
    throw error;
  }
}

async function checkSecurityPolicies() {
  const admin = await initializeGoogleClient();

  try {
    // Get domain-wide delegation settings
    const domainSettings = await admin.users.list({
      customer: 'my_customer',
      maxResults: 1,
      projection: 'full',
    });

    // Check password policies, session settings, etc.
    // This would require additional API calls to the Admin Settings API

    return {
      message: 'Security policy check - implementation pending',
      // Add actual policy checks here
    };
  } catch (error) {
    console.error('Error checking security policies:', error);
    throw error;
  }
}

/**
 * MCP Server Implementation
 */

const server = new Server(
  {
    name: 'google-workspace-security',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_users_without_2fa',
        description: 'List all Google Workspace users without two-factor authentication enabled',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'find_admin_accounts',
        description: 'Find all admin accounts and their security status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'analyze_external_sharing',
        description: 'Analyze files and folders shared with external users',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'check_security_policies',
        description: 'Check Google Workspace security policies and settings',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_users_without_2fa':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await listUsersWithoutTwoFactor(), null, 2),
            },
          ],
        };

      case 'find_admin_accounts':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await findAdminAccounts(), null, 2),
            },
          ],
        };

      case 'analyze_external_sharing':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await analyzeExternalSharing(), null, 2),
            },
          ],
        };

      case 'check_security_policies':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await checkSecurityPolicies(), null, 2),
            },
          ],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register resources (static data about workspace)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'workspace://security-summary',
        name: 'Security Summary',
        mimeType: 'application/json',
        description: 'Overall security summary of Google Workspace',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'workspace://security-summary') {
    try {
      // Fetch security summary from database
      const result = await pool.query(
        `SELECT type, severity, COUNT(*) as count
         FROM findings
         WHERE org_id = $1
         GROUP BY type, severity
         ORDER BY severity DESC`,
        [process.env.ORG_ID]
      );

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(result.rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to read resource ${uri}: ${error.message}`);
    }
  }

  throw new Error(`Unknown resource: ${uri}`);
});

/**
 * Start server
 */
async function main() {
  console.error('Starting Google Workspace Security MCP Server...');

  // Verify database connection
  try {
    await pool.query('SELECT 1');
    console.error('Database connection established');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Google Workspace Security MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
