/**
 * Audit Logger Service
 *
 * Provides comprehensive audit logging for compliance and security:
 * - Tracks all data access and modifications
 * - Records user actions per tenant
 * - Supports security event monitoring
 * - Enables compliance reporting
 */

class AuditLoggerService {
  /**
   * @param {DatabaseService} databaseService - Database service instance
   */
  constructor(databaseService) {
    this.db = databaseService;
  }

  /**
   * Log an action to the audit trail
   * @param {object} params - Audit log parameters
   * @param {string} params.orgId - Organization ID (required)
   * @param {string} params.userId - User ID (Cognito sub, SAML ID, etc.)
   * @param {string} params.action - Action performed (e.g., 'conversation.create')
   * @param {string} params.resourceType - Type of resource (e.g., 'conversation', 'user')
   * @param {string} params.resourceId - ID of the resource
   * @param {string} params.ipAddress - IP address of the request
   * @param {string} params.userAgent - User agent string
   * @param {string} params.requestId - Request ID for correlation
   * @param {string} params.status - 'success', 'failure', or 'unauthorized'
   * @param {string} params.errorMessage - Error message if failed
   * @param {object} params.metadata - Additional metadata
   * @returns {Promise<object>} Created audit log entry
   */
  async log(params) {
    const {
      orgId,
      userId = null,
      action,
      resourceType = null,
      resourceId = null,
      ipAddress = null,
      userAgent = null,
      requestId = null,
      status = 'success',
      errorMessage = null,
      metadata = {}
    } = params;

    // Validate required fields
    if (!orgId) {
      console.error('Audit log failed: orgId is required');
      return null; // Don't throw - logging failures shouldn't break the app
    }

    if (!action) {
      console.error('Audit log failed: action is required');
      return null;
    }

    try {
      const query = `
        INSERT INTO audit_logs (
          org_id,
          user_id,
          action,
          resource_type,
          resource_id,
          ip_address,
          user_agent,
          request_id,
          status,
          error_message,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        orgId,
        userId,
        action,
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        requestId,
        status,
        errorMessage,
        JSON.stringify(metadata)
      ]);

      return result.rows[0];
    } catch (error) {
      // Log but don't throw - audit failures shouldn't break the application
      console.error('Failed to write audit log:', error);
      return null;
    }
  }

  /**
   * Log a successful action
   */
  async logSuccess(params) {
    return await this.log({ ...params, status: 'success' });
  }

  /**
   * Log a failed action
   */
  async logFailure(params) {
    return await this.log({ ...params, status: 'failure' });
  }

  /**
   * Log an unauthorized access attempt
   */
  async logUnauthorized(params) {
    return await this.log({ ...params, status: 'unauthorized' });
  }

  /**
   * Get audit logs for an organization
   * @param {string} orgId - Organization ID
   * @param {object} filters - Optional filters
   * @param {string} filters.userId - Filter by user
   * @param {string} filters.action - Filter by action
   * @param {string} filters.resourceType - Filter by resource type
   * @param {string} filters.status - Filter by status
   * @param {Date} filters.startDate - Start date
   * @param {Date} filters.endDate - End date
   * @param {number} filters.limit - Max number of results (default 100)
   * @param {number} filters.offset - Pagination offset
   * @returns {Promise<Array>} Audit log entries
   */
  async getAuditLogs(orgId, filters = {}) {
    let query = `
      SELECT
        id,
        org_id,
        user_id,
        action,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        request_id,
        status,
        error_message,
        metadata,
        created_at
      FROM audit_logs
      WHERE org_id = $1
    `;

    const params = [orgId];
    let paramIndex = 2;

    // Apply filters
    if (filters.userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.action) {
      query += ` AND action = $${paramIndex}`;
      params.push(filters.action);
      paramIndex++;
    }

    if (filters.resourceType) {
      query += ` AND resource_type = $${paramIndex}`;
      params.push(filters.resourceType);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    // Order and pagination
    query += ` ORDER BY created_at DESC`;

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get audit log statistics for an organization
   * @param {string} orgId - Organization ID
   * @param {Date} startDate - Start date for stats
   * @param {Date} endDate - End date for stats
   * @returns {Promise<object>} Statistics object
   */
  async getAuditStats(orgId, startDate, endDate) {
    const query = `
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_events,
        COUNT(CASE WHEN status = 'failure' THEN 1 END) as failed_events,
        COUNT(CASE WHEN status = 'unauthorized' THEN 1 END) as unauthorized_events,
        json_object_agg(
          action,
          count
        ) FILTER (WHERE action IS NOT NULL) as actions_breakdown
      FROM (
        SELECT
          user_id,
          status,
          action,
          COUNT(*) as count
        FROM audit_logs
        WHERE org_id = $1
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY user_id, status, action
      ) subquery
    `;

    const result = await this.db.query(query, [orgId, startDate, endDate]);
    return result.rows[0] || {};
  }

  /**
   * Helper: Extract IP address from Lambda event
   */
  static extractIpAddress(event) {
    return event.requestContext?.http?.sourceIp ||
           event.requestContext?.identity?.sourceIp ||
           null;
  }

  /**
   * Helper: Extract User-Agent from Lambda event
   */
  static extractUserAgent(event) {
    return event.headers?.['user-agent'] ||
           event.headers?.['User-Agent'] ||
           null;
  }

  /**
   * Helper: Extract Request ID from Lambda event
   */
  static extractRequestId(event) {
    return event.requestContext?.requestId || null;
  }

  /**
   * Create audit context from Lambda event
   * Returns an object with common audit fields extracted from the event
   */
  static createAuditContext(event, user = null, orgId = null) {
    return {
      orgId,
      userId: user?.userId || null,
      ipAddress: this.extractIpAddress(event),
      userAgent: this.extractUserAgent(event),
      requestId: this.extractRequestId(event)
    };
  }
}

module.exports = { AuditLoggerService };
