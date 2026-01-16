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
   * Analyzes user security posture and generates policy recommendations
   */
  async checkSecurityPolicies(orgId) {
    const auth = await this.getAuthenticatedClient(orgId);
    const admin = google.admin({ version: 'directory_v1', auth });

    try {
      // Get all users to analyze security posture
      const response = await admin.users.list({
        customer: 'my_customer',
        maxResults: 500,
        projection: 'full',
      });

      const users = response.data.users || [];
      const totalUsers = users.length;
      const activeUsers = users.filter(u => !u.suspended);

      // Calculate security metrics
      const usersWithout2FA = activeUsers.filter(u => !u.isEnrolledIn2Sv);
      const adminsWithout2FA = activeUsers.filter(u => u.isAdmin && !u.isEnrolledIn2Sv);
      const superAdmins = activeUsers.filter(u => u.isAdmin && !u.isDelegatedAdmin);
      const suspendedUsers = users.filter(u => u.suspended);
      const recentlyInactiveUsers = activeUsers.filter(u => {
        if (!u.lastLoginTime) return true;
        const lastLogin = new Date(u.lastLoginTime);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return lastLogin < thirtyDaysAgo;
      });

      // Calculate 2FA adoption rate
      const twoFactorAdoptionRate = activeUsers.length > 0
        ? ((activeUsers.length - usersWithout2FA.length) / activeUsers.length * 100).toFixed(1)
        : 0;

      // Generate findings for policy violations
      const findings = [];

      // Check: 2FA enforcement
      if (usersWithout2FA.length > 0) {
        findings.push({
          type: '2fa_not_enforced',
          severity: 'high',
          description: `${usersWithout2FA.length} users do not have 2FA enabled`,
          recommendation: 'Enable mandatory 2FA in Admin Console > Security > Authentication > 2-Step Verification',
          affectedCount: usersWithout2FA.length,
        });
      }

      // Check: Admin 2FA (critical)
      if (adminsWithout2FA.length > 0) {
        findings.push({
          type: 'admin_2fa_missing',
          severity: 'critical',
          description: `${adminsWithout2FA.length} admin accounts do not have 2FA enabled`,
          recommendation: 'Immediately enable 2FA for all administrator accounts',
          affectedCount: adminsWithout2FA.length,
          affectedUsers: adminsWithout2FA.map(u => u.primaryEmail),
        });
      }

      // Check: Too many super admins
      if (superAdmins.length > 3) {
        findings.push({
          type: 'excessive_super_admins',
          severity: 'medium',
          description: `${superAdmins.length} super admin accounts detected (recommended: 2-3)`,
          recommendation: 'Reduce number of super admin accounts and use delegated admin roles',
          affectedCount: superAdmins.length,
        });
      }

      // Check: Inactive users
      if (recentlyInactiveUsers.length > 0) {
        findings.push({
          type: 'inactive_users',
          severity: 'low',
          description: `${recentlyInactiveUsers.length} users have not logged in for 30+ days`,
          recommendation: 'Review inactive accounts for potential suspension or deletion',
          affectedCount: recentlyInactiveUsers.length,
        });
      }

      // Store critical findings in database
      for (const finding of findings.filter(f => f.severity === 'critical' || f.severity === 'high')) {
        await this.db.query(
          `INSERT INTO findings (org_id, type, severity, resource, description, discovered_at, metadata)
           VALUES ($1, $2, $3, $4, $5, NOW(), $6)
           ON CONFLICT DO NOTHING`,
          [
            orgId,
            finding.type,
            finding.severity,
            'security_policy',
            finding.description,
            JSON.stringify({
              recommendation: finding.recommendation,
              affectedCount: finding.affectedCount,
              affectedUsers: finding.affectedUsers,
            }),
          ]
        );
      }

      // Calculate overall security score (0-100)
      let securityScore = 100;
      securityScore -= (100 - parseFloat(twoFactorAdoptionRate)) * 0.4; // 2FA is 40% of score
      securityScore -= adminsWithout2FA.length * 10; // -10 per admin without 2FA
      securityScore -= Math.max(0, superAdmins.length - 3) * 5; // -5 per excess super admin
      securityScore -= Math.min(20, recentlyInactiveUsers.length); // Up to -20 for inactive users
      securityScore = Math.max(0, Math.min(100, Math.round(securityScore)));

      return {
        status: 'analyzed',
        timestamp: new Date().toISOString(),
        summary: {
          totalUsers,
          activeUsers: activeUsers.length,
          suspendedUsers: suspendedUsers.length,
          twoFactorAdoptionRate: `${twoFactorAdoptionRate}%`,
          superAdminCount: superAdmins.length,
          inactiveUsers: recentlyInactiveUsers.length,
          securityScore,
        },
        findings,
        recommendations: [
          twoFactorAdoptionRate < 100 && 'Enforce 2-Step Verification for all users',
          adminsWithout2FA.length > 0 && 'Require 2FA for all admin accounts immediately',
          superAdmins.length > 3 && 'Review and reduce super admin count',
          recentlyInactiveUsers.length > 10 && 'Audit and clean up inactive accounts',
        ].filter(Boolean),
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
