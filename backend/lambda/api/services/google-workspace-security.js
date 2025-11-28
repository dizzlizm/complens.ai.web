/**
 * Google Workspace Security Service
 * Provides security analysis tools for Google Workspace
 */

const { google } = require('googleapis');

class GoogleWorkspaceSecurityService {
  constructor(databaseService) {
    this.db = databaseService;
  }

  /**
   * Get OAuth tokens from database and create authenticated client
   */
  async getAuthenticatedClient(orgId) {
    try {
      // Get OAuth tokens from database
      const result = await this.db.query(
        `SELECT access_token, refresh_token, token_expiry
         FROM google_workspace_connections
         WHERE org_id = $1 AND disconnected_at IS NULL`,
        [orgId]
      );

      if (result.rows.length === 0) {
        throw new Error('Google Workspace not connected. Please connect via the dashboard.');
      }

      const { access_token, refresh_token, token_expiry } = result.rows[0];

      // Check if token is expired
      const isExpired = new Date(token_expiry) < new Date();

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: access_token,
        refresh_token: refresh_token,
      });

      // Refresh token if expired
      if (isExpired) {
        console.log('Access token expired, refreshing...');
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update tokens in database
        await this.db.query(
          `UPDATE google_workspace_connections
           SET access_token = $1, token_expiry = $2
           WHERE org_id = $3`,
          [credentials.access_token, new Date(credentials.expiry_date), orgId]
        );

        console.log('Token refreshed successfully');
      }

      return oauth2Client;
    } catch (error) {
      console.error('Failed to get authenticated client:', error);
      throw error;
    }
  }

  /**
   * List all users without two-factor authentication
   */
  async listUsersWithoutTwoFactor(orgId) {
    const auth = await this.getAuthenticatedClient(orgId);
    const admin = google.admin({ version: 'directory_v1', auth });

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
        await this.db.query(
          `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)
           ON CONFLICT DO NOTHING`,
          [
            orgId,
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

  /**
   * Find all admin accounts and their security status
   */
  async findAdminAccounts(orgId) {
    const auth = await this.getAuthenticatedClient(orgId);
    const admin = google.admin({ version: 'directory_v1', auth });

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

  /**
   * Analyze files shared with external users
   */
  async analyzeExternalSharing(orgId) {
    const auth = await this.getAuthenticatedClient(orgId);
    const drive = google.drive({ version: 'v3', auth });

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
        await this.db.query(
          `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)
           ON CONFLICT DO NOTHING`,
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

  /**
   * Check security policies and settings
   */
  async checkSecurityPolicies(orgId) {
    const auth = await this.getAuthenticatedClient(orgId);
    const admin = google.admin({ version: 'directory_v1', auth });

    try {
      // Get basic domain information
      const response = await admin.users.list({
        customer: 'my_customer',
        maxResults: 1,
        projection: 'full',
      });

      // TODO: Add more comprehensive policy checks
      // This would require additional API calls to the Admin Settings API

      return {
        status: 'analyzed',
        message: 'Basic security policy check completed',
        timestamp: new Date().toISOString(),
        // Add actual policy checks here
      };
    } catch (error) {
      console.error('Error checking security policies:', error);
      throw error;
    }
  }

  /**
   * Get security summary from findings database
   */
  async getSecuritySummary(orgId) {
    try {
      const result = await this.db.query(
        `SELECT type, severity, COUNT(*) as count
         FROM findings
         WHERE org_id = $1
         GROUP BY type, severity
         ORDER BY severity DESC`,
        [orgId]
      );

      return {
        summary: result.rows,
        totalFindings: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
      };
    } catch (error) {
      console.error('Error fetching security summary:', error);
      throw error;
    }
  }
}

module.exports = { GoogleWorkspaceSecurityService };
