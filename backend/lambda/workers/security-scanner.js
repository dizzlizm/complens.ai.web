/**
 * Security Scanner Worker
 *
 * Scheduled Lambda that scans all connected Google Workspaces for security issues.
 * Triggered by EventBridge on a schedule (e.g., daily at 2 AM UTC).
 *
 * Workflow:
 * 1. Get all organizations with active GWS connections
 * 2. For each org, run security scans:
 *    - Users without 2FA
 *    - Admin accounts review
 *    - External file sharing
 *    - Security policy check
 * 3. Store findings in database
 * 4. Send alerts for critical/high severity findings
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { Client } = require('pg');
const { google } = require('googleapis');

// Initialize clients
const secretsClient = new SecretsManagerClient({ region: process.env.REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.REGION || 'us-east-1' });

let dbCredentials = null;

/**
 * Get database credentials from Secrets Manager
 */
async function getDbCredentials() {
  if (dbCredentials) return dbCredentials;

  const command = new GetSecretValueCommand({
    SecretId: process.env.SECRETS_ARN,
  });

  const response = await secretsClient.send(command);
  dbCredentials = JSON.parse(response.SecretString);
  return dbCredentials;
}

/**
 * Create database connection
 */
async function getDbClient() {
  const creds = await getDbCredentials();
  const client = new Client({
    host: creds.dbHost,
    port: parseInt(creds.dbPort),
    database: creds.dbName,
    user: creds.dbUsername,
    password: creds.dbPassword,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Get all organizations with active GWS connections
 */
async function getConnectedOrganizations(dbClient) {
  const result = await dbClient.query(`
    SELECT
      o.id as org_id,
      o.name as org_name,
      o.domain,
      gwc.access_token,
      gwc.refresh_token,
      gwc.token_expiry,
      gwc.connected_email
    FROM organizations o
    JOIN google_workspace_connections gwc ON o.id = gwc.org_id
    WHERE gwc.disconnected_at IS NULL
      AND o.status = 'active'
  `);
  return result.rows;
}

/**
 * Create authenticated Google client
 */
async function getGoogleClient(connection, dbClient) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
  });

  // Check if token is expired and refresh
  const isExpired = new Date(connection.token_expiry) < new Date();
  if (isExpired) {
    console.log(`Refreshing token for org ${connection.org_id}`);
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update tokens in database
    await dbClient.query(
      `UPDATE google_workspace_connections
       SET access_token = $1, token_expiry = $2
       WHERE org_id = $3`,
      [credentials.access_token, new Date(credentials.expiry_date), connection.org_id]
    );
  }

  return oauth2Client;
}

/**
 * Scan users without 2FA
 */
async function scanUsersWithout2FA(auth, orgId, dbClient) {
  const admin = google.admin({ version: 'directory_v1', auth });

  const response = await admin.users.list({
    customer: 'my_customer',
    maxResults: 500,
    projection: 'full',
  });

  const users = response.data.users || [];
  const usersWithout2FA = users.filter(u => !u.suspended && !u.isEnrolledIn2Sv);

  let findingsCount = 0;
  for (const user of usersWithout2FA) {
    const result = await dbClient.query(
      `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (org_id, type, resource) DO UPDATE SET
         discovered_at = NOW(),
         metadata = $6
       RETURNING id`,
      [
        orgId,
        'missing_2fa',
        user.isAdmin ? 'critical' : 'high',
        user.primaryEmail,
        `User ${user.primaryEmail} does not have 2FA enabled`,
        JSON.stringify({
          isAdmin: user.isAdmin,
          lastLoginTime: user.lastLoginTime,
          source: 'scheduled_scan',
        }),
      ]
    );
    if (result.rows.length > 0) findingsCount++;
  }

  return {
    scanned: users.length,
    findings: findingsCount,
    criticalAdmins: usersWithout2FA.filter(u => u.isAdmin).length,
  };
}

/**
 * Scan external file sharing
 */
async function scanExternalSharing(auth, orgId, dbClient) {
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q: "visibility='anyoneWithLink' or visibility='anyoneCanFind'",
    fields: 'files(id,name,mimeType,webViewLink,owners)',
    pageSize: 100,
  });

  const files = response.data.files || [];

  let findingsCount = 0;
  for (const file of files) {
    const result = await dbClient.query(
      `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (org_id, type, resource) DO UPDATE SET
         discovered_at = NOW(),
         metadata = $6
       RETURNING id`,
      [
        orgId,
        'external_sharing',
        'medium',
        file.id,
        `File "${file.name}" is shared externally`,
        JSON.stringify({
          name: file.name,
          mimeType: file.mimeType,
          link: file.webViewLink,
          owners: file.owners?.map(o => o.emailAddress),
          source: 'scheduled_scan',
        }),
      ]
    );
    if (result.rows.length > 0) findingsCount++;
  }

  return {
    scanned: files.length,
    findings: findingsCount,
  };
}

/**
 * Calculate security score for an organization
 */
async function calculateSecurityScore(auth, orgId, dbClient) {
  const admin = google.admin({ version: 'directory_v1', auth });

  const response = await admin.users.list({
    customer: 'my_customer',
    maxResults: 500,
    projection: 'full',
  });

  const users = response.data.users || [];
  const activeUsers = users.filter(u => !u.suspended);
  const usersWithout2FA = activeUsers.filter(u => !u.isEnrolledIn2Sv);
  const adminsWithout2FA = activeUsers.filter(u => u.isAdmin && !u.isEnrolledIn2Sv);
  const superAdmins = activeUsers.filter(u => u.isAdmin && !u.isDelegatedAdmin);

  // Calculate 2FA rate
  const twoFARate = activeUsers.length > 0
    ? (activeUsers.length - usersWithout2FA.length) / activeUsers.length * 100
    : 0;

  // Calculate score
  let score = 100;
  score -= (100 - twoFARate) * 0.4;
  score -= adminsWithout2FA.length * 10;
  score -= Math.max(0, superAdmins.length - 3) * 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Store score in organization settings
  await dbClient.query(
    `UPDATE organizations
     SET settings = settings || $1::jsonb
     WHERE id = $2`,
    [
      JSON.stringify({
        lastSecurityScore: score,
        lastScanTime: new Date().toISOString(),
        twoFAAdoptionRate: twoFARate.toFixed(1),
      }),
      orgId,
    ]
  );

  return {
    score,
    twoFARate: twoFARate.toFixed(1),
    totalUsers: activeUsers.length,
    adminsWithout2FA: adminsWithout2FA.length,
  };
}

/**
 * Send alert for critical findings
 */
async function sendAlerts(orgName, results) {
  if (!process.env.ALERTS_SNS_TOPIC_ARN) {
    console.log('No SNS topic configured, skipping alerts');
    return;
  }

  const criticalCount = results.usersWithout2FA?.criticalAdmins || 0;

  if (criticalCount > 0) {
    const message = {
      subject: `CRITICAL: ${criticalCount} admin accounts without 2FA in ${orgName}`,
      body: `Security scan detected ${criticalCount} administrator accounts without two-factor authentication enabled.

Organization: ${orgName}
Security Score: ${results.securityScore?.score || 'N/A'}
2FA Adoption Rate: ${results.securityScore?.twoFARate || 'N/A'}%

Immediate action required: Enable 2FA for all administrator accounts.

View details in the Complens.ai dashboard.`,
      severity: 'critical',
      timestamp: new Date().toISOString(),
    };

    await snsClient.send(new PublishCommand({
      TopicArn: process.env.ALERTS_SNS_TOPIC_ARN,
      Subject: message.subject,
      Message: JSON.stringify(message),
      MessageAttributes: {
        severity: { DataType: 'String', StringValue: 'critical' },
      },
    }));

    console.log(`Alert sent for ${orgName}: ${criticalCount} critical findings`);
  }
}

/**
 * Main handler - Entry point for scheduled execution
 */
exports.handler = async (event) => {
  console.log('Security Scanner Worker started', JSON.stringify(event));

  const startTime = Date.now();
  const results = {
    organizationsScanned: 0,
    totalFindings: 0,
    errors: [],
    scanResults: [],
  };

  let dbClient;

  try {
    dbClient = await getDbClient();

    // Get all connected organizations
    const organizations = await getConnectedOrganizations(dbClient);
    console.log(`Found ${organizations.length} organizations to scan`);

    for (const org of organizations) {
      console.log(`Scanning organization: ${org.org_name} (${org.org_id})`);

      try {
        const auth = await getGoogleClient(org, dbClient);

        // Run all scans
        const orgResults = {
          orgId: org.org_id,
          orgName: org.org_name,
          usersWithout2FA: await scanUsersWithout2FA(auth, org.org_id, dbClient),
          externalSharing: await scanExternalSharing(auth, org.org_id, dbClient),
          securityScore: await calculateSecurityScore(auth, org.org_id, dbClient),
        };

        // Send alerts if needed
        await sendAlerts(org.org_name, orgResults);

        results.scanResults.push(orgResults);
        results.organizationsScanned++;
        results.totalFindings +=
          (orgResults.usersWithout2FA?.findings || 0) +
          (orgResults.externalSharing?.findings || 0);

        console.log(`Completed scan for ${org.org_name}:`, JSON.stringify(orgResults));

      } catch (orgError) {
        console.error(`Error scanning org ${org.org_name}:`, orgError);
        results.errors.push({
          orgId: org.org_id,
          orgName: org.org_name,
          error: orgError.message,
        });
      }
    }

    // Log scan completion to audit
    await dbClient.query(
      `INSERT INTO audit_logs (org_id, user_id, action, resource_type, status, metadata, created_at)
       VALUES (NULL, NULL, 'scheduled_security_scan', 'system', 'success', $1, NOW())`,
      [JSON.stringify({
        duration: Date.now() - startTime,
        organizationsScanned: results.organizationsScanned,
        totalFindings: results.totalFindings,
        errors: results.errors.length,
      })]
    );

  } catch (error) {
    console.error('Fatal error in security scanner:', error);
    results.errors.push({ fatal: true, error: error.message });
  } finally {
    if (dbClient) {
      await dbClient.end();
    }
  }

  const duration = Date.now() - startTime;
  console.log(`Security Scanner completed in ${duration}ms:`, JSON.stringify(results));

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Security scan completed',
      duration,
      ...results,
    }),
  };
};
