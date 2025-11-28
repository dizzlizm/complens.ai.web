/**
 * User Management Service
 * Handles CRUD operations for admin users with role-based access control
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class UserManagementService {
  constructor(databaseService) {
    this.db = databaseService;
  }

  /**
   * Valid user roles
   */
  static ROLES = {
    SUPER_ADMIN: 'super_admin',
    USER_ADMIN: 'user_admin',
    SERVICE_ACCOUNT: 'service_account',
    REGULAR_USER: 'regular_user',
  };

  /**
   * Validate role
   */
  isValidRole(role) {
    return Object.values(UserManagementService.ROLES).includes(role);
  }

  /**
   * List all users for an organization
   */
  async listUsers(orgId) {
    const result = await this.db.query(
      `SELECT
        id,
        org_id,
        email,
        name,
        role,
        is_active,
        last_login,
        created_at,
        updated_at,
        metadata
      FROM admin_users
      WHERE org_id = $1
      ORDER BY created_at DESC`,
      [orgId]
    );

    return result.rows;
  }

  /**
   * Get a specific user by ID
   */
  async getUser(userId, orgId) {
    const result = await this.db.query(
      `SELECT
        id,
        org_id,
        email,
        name,
        role,
        is_active,
        last_login,
        created_at,
        updated_at,
        metadata
      FROM admin_users
      WHERE id = $1 AND org_id = $2`,
      [userId, orgId]
    );

    return result.rows[0] || null;
  }

  /**
   * Create a new user
   */
  async createUser({ orgId, email, name, role, isActive = true, createdBy = null }) {
    // Validate role
    if (!this.isValidRole(role)) {
      throw new Error(`Invalid role: ${role}. Must be one of: ${Object.values(UserManagementService.ROLES).join(', ')}`);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Check if user already exists
    const existing = await this.db.query(
      'SELECT id FROM admin_users WHERE org_id = $1 AND email = $2',
      [orgId, email]
    );

    if (existing.rows.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Generate API key for service accounts
    let apiKeyHash = null;
    let apiKey = null;
    if (role === UserManagementService.ROLES.SERVICE_ACCOUNT) {
      apiKey = this.generateApiKey();
      apiKeyHash = this.hashApiKey(apiKey);
    }

    // Insert user
    const result = await this.db.query(
      `INSERT INTO admin_users (
        org_id,
        email,
        name,
        role,
        is_active,
        api_key_hash,
        created_by,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, org_id, email, name, role, is_active, created_at`,
      [orgId, email, name, role, isActive, apiKeyHash, createdBy, JSON.stringify({})]
    );

    const user = result.rows[0];

    // Return API key only once for service accounts
    if (apiKey) {
      user.apiKey = apiKey;
      user.apiKeyNote = 'Save this API key securely. It will not be shown again.';
    }

    return user;
  }

  /**
   * Update a user
   */
  async updateUser(userId, orgId, updates, updatedBy = null) {
    const { email, name, role, isActive } = updates;

    // Validate role if provided
    if (role && !this.isValidRole(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (role !== undefined) {
      fields.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (isActive !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }
    if (updatedBy) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(updatedBy);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    // Add WHERE clause parameters
    values.push(userId);
    values.push(orgId);

    const result = await this.db.query(
      `UPDATE admin_users
       SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND org_id = $${paramCount++}
       RETURNING id, org_id, email, name, role, is_active, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  /**
   * Delete a user
   */
  async deleteUser(userId, orgId) {
    const result = await this.db.query(
      'DELETE FROM admin_users WHERE id = $1 AND org_id = $2 RETURNING id',
      [userId, orgId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return { deleted: true, id: userId };
  }

  /**
   * Generate a secure API key
   */
  generateApiKey() {
    return `cl_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Hash an API key for storage
   */
  hashApiKey(apiKey) {
    return crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');
  }

  /**
   * Verify an API key
   */
  async verifyApiKey(apiKey) {
    const hash = this.hashApiKey(apiKey);
    const result = await this.db.query(
      `SELECT id, org_id, email, name, role, is_active
       FROM admin_users
       WHERE api_key_hash = $1 AND is_active = true`,
      [hash]
    );

    return result.rows[0] || null;
  }
}

module.exports = { UserManagementService };
