/**
 * Tenant Context Service
 *
 * Manages multi-tenant isolation by:
 * 1. Mapping authenticated users to organizations
 * 2. Validating tenant access
 * 3. Providing tenant-scoped database query helpers
 * 4. Enforcing row-level security
 */

class TenantContextService {
  /**
   * @param {DatabaseService} databaseService - Database service instance
   */
  constructor(databaseService) {
    this.db = databaseService;

    // Cache for user → org mappings (5 minute TTL)
    this.userOrgCache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get organization(s) for a user
   * @param {string} userId - User ID (Cognito sub, SAML user ID, or local user ID)
   * @param {string} authProvider - Auth provider type: 'cognito', 'saml', or 'local'
   * @returns {Promise<Array>} Array of user-organization mappings
   */
  async getUserOrganizations(userId, authProvider = 'cognito') {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const cacheKey = `${authProvider}:${userId}`;

    // Check cache first
    const cached = this.userOrgCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`Cache hit for user ${userId}`);
      return cached.data;
    }

    // Query database
    const query = `
      SELECT
        uo.id,
        uo.user_id,
        uo.org_id,
        uo.role,
        uo.auth_provider,
        uo.is_primary,
        uo.metadata,
        uo.created_at,
        o.name as org_name,
        o.domain as org_domain,
        o.tier as org_tier,
        o.status as org_status,
        o.settings as org_settings,
        o.features as org_features
      FROM user_organizations uo
      JOIN organizations o ON uo.org_id = o.id
      WHERE uo.user_id = $1
        AND uo.auth_provider = $2
        AND o.status = 'active'
      ORDER BY uo.is_primary DESC, uo.created_at ASC
    `;

    const result = await this.db.query(query, [userId, authProvider]);

    // Cache the result
    this.userOrgCache.set(cacheKey, {
      data: result.rows,
      timestamp: Date.now()
    });

    return result.rows;
  }

  /**
   * Get primary organization for a user
   * @param {string} userId - User ID
   * @param {string} authProvider - Auth provider type
   * @returns {Promise<object|null>} Primary organization or null
   */
  async getPrimaryOrganization(userId, authProvider = 'cognito') {
    const orgs = await this.getUserOrganizations(userId, authProvider);

    if (orgs.length === 0) {
      return null;
    }

    // Return the primary org, or first org if no primary is set
    return orgs.find(org => org.is_primary) || orgs[0];
  }

  /**
   * Validate that a user has access to a specific organization
   * @param {string} userId - User ID
   * @param {string} orgId - Organization ID to validate
   * @param {string} authProvider - Auth provider type
   * @param {string[]} requiredRoles - Required roles (e.g., ['owner', 'admin'])
   * @returns {Promise<object>} User-org mapping if valid
   * @throws {Error} If user doesn't have access
   */
  async validateUserOrgAccess(userId, orgId, authProvider = 'cognito', requiredRoles = null) {
    if (!userId || !orgId) {
      throw new Error('User ID and Organization ID are required');
    }

    const orgs = await this.getUserOrganizations(userId, authProvider);
    const userOrg = orgs.find(org => org.org_id === orgId);

    if (!userOrg) {
      const error = new Error('Access denied: User does not belong to this organization');
      error.statusCode = 403;
      throw error;
    }

    // Check role requirements if specified
    if (requiredRoles && !requiredRoles.includes(userOrg.role)) {
      const error = new Error(`Access denied: Required role is one of [${requiredRoles.join(', ')}]`);
      error.statusCode = 403;
      throw error;
    }

    return userOrg;
  }

  /**
   * Create a new user-organization mapping
   * @param {object} params - Mapping parameters
   * @param {string} params.userId - User ID
   * @param {string} params.orgId - Organization ID
   * @param {string} params.role - User role ('owner', 'admin', 'member')
   * @param {string} params.authProvider - Auth provider ('cognito', 'saml', 'local')
   * @param {boolean} params.isPrimary - Is this the primary org for the user
   * @param {string} params.createdBy - User ID of creator
   * @param {object} params.metadata - Additional metadata (email, name, etc.)
   * @returns {Promise<object>} Created mapping
   */
  async createUserOrgMapping(params) {
    const {
      userId,
      orgId,
      role = 'member',
      authProvider = 'cognito',
      isPrimary = false,
      createdBy = null,
      metadata = {}
    } = params;

    console.log(`Creating user-org mapping: user=${userId}, org=${orgId}, role=${role}, provider=${authProvider}`);

    // Validate role
    const validRoles = ['owner', 'admin', 'member'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Validate auth provider
    const validProviders = ['cognito', 'saml', 'local'];
    if (!validProviders.includes(authProvider)) {
      throw new Error(`Invalid auth provider. Must be one of: ${validProviders.join(', ')}`);
    }

    const query = `
      INSERT INTO user_organizations (
        user_id,
        org_id,
        role,
        auth_provider,
        is_primary,
        created_by,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      userId,
      orgId,
      role,
      authProvider,
      isPrimary,
      createdBy,
      JSON.stringify(metadata)
    ]);

    // Invalidate cache for this user
    const cacheKey = `${authProvider}:${userId}`;
    this.userOrgCache.delete(cacheKey);

    return result.rows[0];
  }

  /**
   * Create a new organization with the first user as owner
   * @param {object} params - Organization parameters
   * @param {string} params.name - Organization name
   * @param {string} params.domain - Organization domain
   * @param {string} params.userId - First user's ID (owner)
   * @param {string} params.authProvider - Auth provider for the user
   * @param {string} params.tier - Subscription tier
   * @param {object} params.settings - Organization settings
   * @param {object} params.metadata - User metadata (email, name, etc.)
   * @returns {Promise<object>} Created organization with user mapping
   */
  async createOrganizationWithOwner(params) {
    const {
      name,
      domain,
      userId,
      authProvider = 'cognito',
      tier = 'free',
      settings = {},
      metadata = {},
      features = {
        sso_enabled: false,
        audit_logs: tier === 'enterprise',
        api_access: tier !== 'free',
        custom_integrations: tier === 'enterprise'
      }
    } = params;

    console.log(`Creating organization with owner: name=${name}, domain=${domain}, userId=${userId}`);

    // Start transaction
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // Check if organization with this domain already exists
      const existingOrgQuery = `
        SELECT * FROM organizations WHERE domain = $1
      `;
      const existingOrgResult = await client.query(existingOrgQuery, [domain]);

      let organization;
      if (existingOrgResult.rows.length > 0) {
        // Organization already exists, use it
        organization = existingOrgResult.rows[0];
        console.log(`Organization with domain ${domain} already exists (id: ${organization.id}). Using existing org.`);
      } else {
        // Create new organization
        const orgQuery = `
          INSERT INTO organizations (name, domain, tier, settings, features)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;

        const orgResult = await client.query(orgQuery, [
          name,
          domain,
          tier,
          JSON.stringify(settings),
          JSON.stringify(features)
        ]);

        organization = orgResult.rows[0];
        console.log(`Created new organization ${organization.id} for domain ${domain}`);
      }

      // Check if user-org mapping already exists
      const existingMappingQuery = `
        SELECT * FROM user_organizations
        WHERE user_id = $1 AND org_id = $2 AND auth_provider = $3
      `;
      const existingMappingResult = await client.query(existingMappingQuery, [
        userId,
        organization.id,
        authProvider
      ]);

      let mapping;
      if (existingMappingResult.rows.length > 0) {
        // Mapping already exists
        mapping = existingMappingResult.rows[0];
        console.log(`User-org mapping already exists for user ${userId} and org ${organization.id}`);
      } else {
        // Create user-org mapping with owner role and metadata
        const mappingQuery = `
          INSERT INTO user_organizations (user_id, org_id, role, auth_provider, is_primary, metadata)
          VALUES ($1, $2, 'owner', $3, true, $4)
          RETURNING *
        `;

        const mappingResult = await client.query(mappingQuery, [
          userId,
          organization.id,
          authProvider,
          JSON.stringify(metadata)
        ]);

        mapping = mappingResult.rows[0];
        console.log(`Created user-org mapping for user ${userId} and org ${organization.id}`);
      }

      await client.query('COMMIT');

      console.log(`Successfully created org ${organization.id} with user ${userId} as owner`);

      // Invalidate cache
      const cacheKey = `${authProvider}:${userId}`;
      this.userOrgCache.delete(cacheKey);

      return {
        organization,
        userMapping: mappingResult.rows[0]
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to create organization with owner:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Set the current organization context in PostgreSQL session
   * This enables Row-Level Security policies to work automatically
   * @param {object} client - PostgreSQL client
   * @param {string} orgId - Organization ID
   */
  async setSessionOrgContext(client, orgId) {
    if (!orgId) {
      throw new Error('Organization ID is required for session context');
    }

    await client.query(`SET LOCAL app.current_org_id = $1`, [orgId]);
    console.log(`Session context set to org_id: ${orgId}`);
  }

  /**
   * Create a tenant-scoped database client with RLS enabled
   * @param {string} orgId - Organization ID
   * @returns {Promise<object>} Database client with org context set
   */
  async getTenantScopedClient(orgId) {
    const client = await this.db.getClient();

    try {
      await this.setSessionOrgContext(client, orgId);
      return client;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Execute a query with automatic org_id filtering
   * This is a helper for queries that need tenant isolation
   * @param {string} query - SQL query with $org_id placeholder
   * @param {string} orgId - Organization ID
   * @param {Array} params - Query parameters
   * @returns {Promise<object>} Query result
   */
  async executeTenantQuery(query, orgId, params = []) {
    if (!orgId) {
      throw new Error('Organization ID is required for tenant queries');
    }

    // Replace $org_id placeholder with actual parameter
    const paramIndex = params.length + 1;
    const tenantQuery = query.replace(/\$org_id\b/g, `$${paramIndex}`);

    return await this.db.query(tenantQuery, [...params, orgId]);
  }

  /**
   * Update user's role in organization
   * @param {string} userId - User ID
   * @param {string} orgId - Organization ID
   * @param {string} newRole - New role
   * @param {string} updatedBy - User ID of updater
   * @returns {Promise<object>} Updated mapping
   */
  async updateUserRole(userId, orgId, newRole, updatedBy) {
    const validRoles = ['owner', 'admin', 'member'];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    const query = `
      UPDATE user_organizations
      SET role = $1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND org_id = $3
      RETURNING *
    `;

    const result = await this.db.query(query, [newRole, userId, orgId]);

    if (result.rows.length === 0) {
      throw new Error('User-organization mapping not found');
    }

    return result.rows[0];
  }

  /**
   * Remove user from organization
   * @param {string} userId - User ID
   * @param {string} orgId - Organization ID
   * @returns {Promise<boolean>} True if removed
   */
  async removeUserFromOrg(userId, orgId) {
    const query = `
      DELETE FROM user_organizations
      WHERE user_id = $1 AND org_id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [userId, orgId]);

    // Invalidate cache
    this.userOrgCache.delete(`cognito:${userId}`);
    this.userOrgCache.delete(`saml:${userId}`);
    this.userOrgCache.delete(`local:${userId}`);

    return result.rows.length > 0;
  }

  /**
   * Get all users in an organization
   * @param {string} orgId - Organization ID
   * @param {object} filters - Optional filters (role, authProvider)
   * @returns {Promise<Array>} List of users
   */
  async getOrganizationUsers(orgId, filters = {}) {
    let query = `
      SELECT
        uo.user_id,
        uo.role,
        uo.auth_provider,
        uo.is_primary,
        uo.created_at,
        uo.metadata
      FROM user_organizations uo
      WHERE uo.org_id = $1
    `;

    const params = [orgId];
    let paramIndex = 2;

    if (filters.role) {
      query += ` AND uo.role = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }

    if (filters.authProvider) {
      query += ` AND uo.auth_provider = $${paramIndex}`;
      params.push(filters.authProvider);
      paramIndex++;
    }

    query += ` ORDER BY uo.created_at ASC`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Clear the user-org cache (useful for testing or after bulk updates)
   */
  clearCache() {
    this.userOrgCache.clear();
    console.log('Tenant context cache cleared');
  }
}

module.exports = { TenantContextService };
