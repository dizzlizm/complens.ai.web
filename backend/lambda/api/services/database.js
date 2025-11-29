/**
 * Database Service
 * Handles PostgreSQL connections and queries
 */

const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

class DatabaseService {
  constructor(config) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 2, // Keep connections low for Lambda (cold starts)
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000, // Increased for VPC Lambda cold starts
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });

    // Track if schema has been initialized
    this.schemaInitialized = false;
  }

  /**
   * Ensure database schema exists (called lazily on first DB operation)
   */
  async ensureSchema() {
    // Only initialize once per Lambda container
    if (this.schemaInitialized) {
      return;
    }

    let client;
    try {
      client = await this.pool.connect();

      // Create conversations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR(255), -- Cognito User ID (sub claim)
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          title TEXT,
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `);

      // Migration: Add user_id column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'conversations' AND column_name = 'user_id'
          ) THEN
            ALTER TABLE conversations ADD COLUMN user_id VARCHAR(255);
          END IF;
        END $$;
      `);

      // Add index on user_id for faster lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_user_id
        ON conversations(user_id);
      `);

      // Create messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          metadata JSONB DEFAULT '{}'::jsonb
        );
      `);

      // Create index on conversation_id for faster lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
        ON messages(conversation_id);
      `);

      // Create index on created_at for sorting
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_created_at
        ON messages(created_at);
      `);

      // Create security_intel table for external security data caching
      await client.query(`
        CREATE TABLE IF NOT EXISTS security_intel (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source VARCHAR(50) NOT NULL,
          query_type VARCHAR(50) NOT NULL,
          query_value TEXT NOT NULL,
          raw_data JSONB NOT NULL,
          ai_analysis TEXT,
          cached_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
          org_id UUID
        );
      `);

      // Create unique index for cache lookups
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_security_intel_unique
        ON security_intel(source, query_type, query_value, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid));
      `);

      // Create index on expires_at for cache cleanup
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_security_intel_expires
        ON security_intel(expires_at);
      `);

      // Create index on org_id for organization-specific queries
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_security_intel_org
        ON security_intel(org_id) WHERE org_id IS NOT NULL;
      `);

      this.schemaInitialized = true;
      console.log('Database schema initialized successfully');

    } catch (error) {
      console.error('Error ensuring schema:', error);
      // Don't throw - let the subsequent operations fail with proper error messages
      // This prevents schema issues from blocking all requests
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Execute a raw query
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Query executed:', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      console.error('Query error:', { text, error: error.message });
      throw error;
    }
  }

  /**
   * Get a database client from the pool for transactions
   * Remember to call client.release() when done
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * Save a conversation turn (user message + assistant response)
   */
  async saveConversation({ conversationId, userId, orgId, userMessage, assistantMessage, metadata = {} }) {
    // Ensure schema exists before first operation
    await this.ensureSchema();

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create or get conversation
      let convId = conversationId;
      if (!convId) {
        const result = await client.query(`
          INSERT INTO conversations (user_id, org_id, title, metadata)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          userId || null, // Associate with user if authenticated
          orgId || null, // Associate with organization (REQUIRED for multi-tenant)
          userMessage.substring(0, 100), // Use first 100 chars as title
          JSON.stringify(metadata),
        ]);
        convId = result.rows[0].id;
      } else {
        // Update conversation timestamp
        await client.query(`
          UPDATE conversations
          SET updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [convId]);
      }

      // Insert user message
      await client.query(`
        INSERT INTO messages (conversation_id, role, content, metadata)
        VALUES ($1, $2, $3, $4)
      `, [convId, 'user', userMessage, JSON.stringify({})]);

      // Insert assistant message
      await client.query(`
        INSERT INTO messages (conversation_id, role, content, metadata)
        VALUES ($1, $2, $3, $4)
      `, [convId, 'assistant', assistantMessage, JSON.stringify(metadata)]);

      await client.query('COMMIT');

      return { id: convId };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error saving conversation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get conversations (filtered by org and optionally by user)
   */
  async getConversations(userId = null, orgId = null, limit = 50, offset = 0) {
    // Ensure schema exists before first operation
    await this.ensureSchema();

    let query;
    let params;

    if (orgId && userId) {
      // Filter by both org_id and user_id (most common case)
      query = `
        SELECT
          c.id,
          c.title,
          c.user_id,
          c.org_id,
          c.created_at,
          c.updated_at,
          c.metadata,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        WHERE c.org_id = $1 AND c.user_id = $2
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT $3 OFFSET $4
      `;
      params = [orgId, userId, limit, offset];
    } else if (orgId) {
      // Filter by org_id only (admin view)
      query = `
        SELECT
          c.id,
          c.title,
          c.user_id,
          c.org_id,
          c.created_at,
          c.updated_at,
          c.metadata,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        WHERE c.org_id = $1
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [orgId, limit, offset];
    } else if (userId) {
      // Filter by user_id only (backwards compatibility, but less secure)
      query = `
        SELECT
          c.id,
          c.title,
          c.user_id,
          c.org_id,
          c.created_at,
          c.updated_at,
          c.metadata,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        WHERE c.user_id = $1
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [userId, limit, offset];
    } else {
      // Get all conversations (backwards compatibility for non-authenticated)
      // WARNING: This should not be used in production multi-tenant environment
      query = `
        SELECT
          c.id,
          c.title,
          c.user_id,
          c.org_id,
          c.created_at,
          c.updated_at,
          c.metadata,
          COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const result = await this.query(query, params);
    return result.rows;
  }

  /**
   * Get a specific conversation with all messages (with optional org_id validation)
   */
  async getConversation(conversationId, orgId = null) {
    // Ensure schema exists before first operation
    await this.ensureSchema();

    let query = `
      SELECT id, title, user_id, org_id, created_at, updated_at, metadata
      FROM conversations
      WHERE id = $1
    `;

    let params = [conversationId];

    // Add org_id filter for multi-tenant security
    if (orgId) {
      query += ` AND org_id = $2`;
      params.push(orgId);
    }

    const convResult = await this.query(query, params);

    if (convResult.rows.length === 0) {
      return null;
    }

    const messagesResult = await this.query(`
      SELECT id, role, content, created_at, metadata
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
    `, [conversationId]);

    return {
      ...convResult.rows[0],
      messages: messagesResult.rows,
    };
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId) {
    await this.query(`
      DELETE FROM conversations WHERE id = $1
    `, [conversationId]);
  }

  /**
   * Close the database pool
   */
  async close() {
    await this.pool.end();
  }
}

// Note: uuid package is not needed as we use PostgreSQL's gen_random_uuid()
// Removing the require statement that would cause issues
// If uuid is needed for other purposes, add it to package.json

module.exports = { DatabaseService };
