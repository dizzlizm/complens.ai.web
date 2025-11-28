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
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });

    // Initialize database schema on first use
    this.ensureSchema();
  }

  /**
   * Ensure database schema exists
   */
  async ensureSchema() {
    const client = await this.pool.connect();

    try {
      // Create conversations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          title TEXT,
          metadata JSONB DEFAULT '{}'::jsonb
        );
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

      console.log('Database schema initialized');

    } catch (error) {
      console.error('Error ensuring schema:', error);
      throw error;
    } finally {
      client.release();
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
   * Save a conversation turn (user message + assistant response)
   */
  async saveConversation({ conversationId, userMessage, assistantMessage, metadata = {} }) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create or get conversation
      let convId = conversationId;
      if (!convId) {
        const result = await client.query(`
          INSERT INTO conversations (title, metadata)
          VALUES ($1, $2)
          RETURNING id
        `, [
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
   * Get all conversations
   */
  async getConversations(limit = 50, offset = 0) {
    const result = await this.query(`
      SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        c.metadata,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return result.rows;
  }

  /**
   * Get a specific conversation with all messages
   */
  async getConversation(conversationId) {
    const convResult = await this.query(`
      SELECT id, title, created_at, updated_at, metadata
      FROM conversations
      WHERE id = $1
    `, [conversationId]);

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
