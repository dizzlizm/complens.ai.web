/**
 * Local-first SQLite database for Complens
 *
 * All user data is stored locally on device.
 * Cloud sync is optional and encrypted.
 */

import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';

const DB_NAME = 'complens';
const DB_VERSION = 1;

class LocalDatabase {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection | null = null;
  private platform: string;
  private initialized = false;

  constructor() {
    this.sqlite = new SQLiteConnection(CapacitorSQLite);
    this.platform = Capacitor.getPlatform();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // For web, we use IndexedDB fallback via sql.js
      if (this.platform === 'web') {
        await this.sqlite.initWebStore();
      }

      // Check connection consistency
      const retCC = await this.sqlite.checkConnectionsConsistency();
      const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;

      if (retCC.result && isConn) {
        this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
      } else {
        this.db = await this.sqlite.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          DB_VERSION,
          false
        );
      }

      await this.db.open();
      await this.createTables();
      this.initialized = true;
      console.log('Local database initialized');
    } catch (err) {
      console.error('Failed to initialize database:', err);
      throw err;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const schema = `
      -- User profile (single row)
      CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        google_id TEXT,
        email TEXT,
        name TEXT,
        picture TEXT,
        settings TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Connected Google accounts
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL DEFAULT 'google',
        email TEXT NOT NULL,
        name TEXT,
        picture TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TEXT,
        scopes TEXT,
        status TEXT DEFAULT 'connected',
        last_scanned_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Discovered apps/services with access
      CREATE TABLE IF NOT EXISTS apps (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        client_id TEXT,
        icon_url TEXT,
        scopes TEXT,
        permissions TEXT,
        risk_level TEXT DEFAULT 'unknown',
        risk_score INTEGER DEFAULT 0,
        last_used_at TEXT,
        authorized_at TEXT,
        discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      -- Scan history
      CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        apps_found INTEGER DEFAULT 0,
        high_risk INTEGER DEFAULT 0,
        medium_risk INTEGER DEFAULT 0,
        low_risk INTEGER DEFAULT 0,
        error TEXT,
        started_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      );

      -- User actions log (for undo, audit)
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_apps_account ON apps(account_id);
      CREATE INDEX IF NOT EXISTS idx_apps_risk ON apps(risk_level);
      CREATE INDEX IF NOT EXISTS idx_scans_account ON scans(account_id);
    `;

    await this.db.execute(schema);
  }

  // ============================================
  // PROFILE
  // ============================================

  async getProfile(): Promise<Profile | null> {
    if (!this.db) await this.init();
    const result = await this.db!.query('SELECT * FROM profile WHERE id = 1');
    if (!result.values?.length) return null;
    const row = result.values[0];
    return {
      ...row,
      settings: JSON.parse(row.settings || '{}'),
    };
  }

  async saveProfile(profile: Partial<Profile>): Promise<void> {
    if (!this.db) await this.init();

    const existing = await this.getProfile();
    const settings = JSON.stringify(profile.settings || existing?.settings || {});

    if (existing) {
      await this.db!.run(
        `UPDATE profile SET
          google_id = COALESCE(?, google_id),
          email = COALESCE(?, email),
          name = COALESCE(?, name),
          picture = COALESCE(?, picture),
          settings = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`,
        [profile.googleId, profile.email, profile.name, profile.picture, settings]
      );
    } else {
      await this.db!.run(
        `INSERT INTO profile (id, google_id, email, name, picture, settings)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [profile.googleId, profile.email, profile.name, profile.picture, settings]
      );
    }
  }

  // ============================================
  // ACCOUNTS
  // ============================================

  async getAccounts(): Promise<Account[]> {
    if (!this.db) await this.init();
    const result = await this.db!.query('SELECT * FROM accounts ORDER BY created_at DESC');
    return (result.values || []).map(row => ({
      ...row,
      scopes: JSON.parse(row.scopes || '[]'),
    }));
  }

  async getAccount(id: string): Promise<Account | null> {
    if (!this.db) await this.init();
    const result = await this.db!.query('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!result.values?.length) return null;
    const row = result.values[0];
    return {
      ...row,
      scopes: JSON.parse(row.scopes || '[]'),
    };
  }

  async saveAccount(account: Account): Promise<void> {
    if (!this.db) await this.init();

    const scopes = JSON.stringify(account.scopes || []);

    await this.db!.run(
      `INSERT OR REPLACE INTO accounts
       (id, platform, email, name, picture, access_token, refresh_token, token_expiry, scopes, status, last_scanned_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM accounts WHERE id = ?), CURRENT_TIMESTAMP))`,
      [
        account.id,
        account.platform || 'google',
        account.email,
        account.name,
        account.picture,
        account.accessToken,
        account.refreshToken,
        account.tokenExpiry,
        scopes,
        account.status || 'connected',
        account.lastScannedAt,
        account.id,
      ]
    );
  }

  async deleteAccount(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM accounts WHERE id = ?', [id]);
  }

  // ============================================
  // APPS
  // ============================================

  async getApps(accountId?: string): Promise<App[]> {
    if (!this.db) await this.init();

    const query = accountId
      ? 'SELECT * FROM apps WHERE account_id = ? ORDER BY risk_score DESC, name'
      : 'SELECT * FROM apps ORDER BY risk_score DESC, name';

    const result = await this.db!.query(query, accountId ? [accountId] : []);

    return (result.values || []).map(row => ({
      ...row,
      scopes: JSON.parse(row.scopes || '[]'),
      permissions: JSON.parse(row.permissions || '[]'),
    }));
  }

  async saveApp(app: App): Promise<void> {
    if (!this.db) await this.init();

    await this.db!.run(
      `INSERT OR REPLACE INTO apps
       (id, account_id, name, client_id, icon_url, scopes, permissions, risk_level, risk_score, last_used_at, authorized_at, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT discovered_at FROM apps WHERE id = ?), CURRENT_TIMESTAMP))`,
      [
        app.id,
        app.accountId,
        app.name,
        app.clientId,
        app.iconUrl,
        JSON.stringify(app.scopes || []),
        JSON.stringify(app.permissions || []),
        app.riskLevel,
        app.riskScore,
        app.lastUsedAt,
        app.authorizedAt,
        app.id,
      ]
    );
  }

  async deleteApp(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM apps WHERE id = ?', [id]);
  }

  async deleteAppsForAccount(accountId: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.run('DELETE FROM apps WHERE account_id = ?', [accountId]);
  }

  // ============================================
  // SCANS
  // ============================================

  async createScan(accountId: string): Promise<string> {
    if (!this.db) await this.init();

    const id = `scan_${Date.now()}`;
    await this.db!.run(
      'INSERT INTO scans (id, account_id, status) VALUES (?, ?, ?)',
      [id, accountId, 'pending']
    );
    return id;
  }

  async updateScan(id: string, updates: Partial<Scan>): Promise<void> {
    if (!this.db) await this.init();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.appsFound !== undefined) {
      fields.push('apps_found = ?');
      values.push(updates.appsFound);
    }
    if (updates.highRisk !== undefined) {
      fields.push('high_risk = ?');
      values.push(updates.highRisk);
    }
    if (updates.mediumRisk !== undefined) {
      fields.push('medium_risk = ?');
      values.push(updates.mediumRisk);
    }
    if (updates.lowRisk !== undefined) {
      fields.push('low_risk = ?');
      values.push(updates.lowRisk);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.status === 'complete' || updates.status === 'error') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.db!.run(
      `UPDATE scans SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  async getScan(id: string): Promise<Scan | null> {
    if (!this.db) await this.init();
    const result = await this.db!.query('SELECT * FROM scans WHERE id = ?', [id]);
    return result.values?.[0] || null;
  }

  // ============================================
  // STATS
  // ============================================

  async getStats(): Promise<Stats> {
    if (!this.db) await this.init();

    const [accountsResult, appsResult, riskResult] = await Promise.all([
      this.db!.query('SELECT COUNT(*) as count FROM accounts'),
      this.db!.query('SELECT COUNT(*) as count FROM apps'),
      this.db!.query(`
        SELECT
          SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN risk_level = 'low' THEN 1 ELSE 0 END) as low
        FROM apps
      `),
    ]);

    return {
      accountCount: accountsResult.values?.[0]?.count || 0,
      appCount: appsResult.values?.[0]?.count || 0,
      highRisk: riskResult.values?.[0]?.high || 0,
      mediumRisk: riskResult.values?.[0]?.medium || 0,
      lowRisk: riskResult.values?.[0]?.low || 0,
    };
  }

  // ============================================
  // CLEANUP
  // ============================================

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.execute(`
      DELETE FROM actions;
      DELETE FROM scans;
      DELETE FROM apps;
      DELETE FROM accounts;
      DELETE FROM profile;
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.sqlite.closeConnection(DB_NAME, false);
      this.db = null;
      this.initialized = false;
    }
  }
}

// Types
export interface Profile {
  googleId?: string;
  email?: string;
  name?: string;
  picture?: string;
  settings: {
    notifications?: boolean;
    autoScan?: boolean;
    darkMode?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Account {
  id: string;
  platform: string;
  email: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: string;
  scopes: string[];
  status: 'connected' | 'expired' | 'revoked';
  lastScannedAt?: string;
  createdAt?: string;
}

export interface App {
  id: string;
  accountId: string;
  name: string;
  clientId?: string;
  iconUrl?: string;
  scopes: string[];
  permissions: string[];
  riskLevel: 'high' | 'medium' | 'low' | 'unknown';
  riskScore: number;
  lastUsedAt?: string;
  authorizedAt?: string;
  discoveredAt?: string;
}

export interface Scan {
  id: string;
  accountId: string;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  appsFound: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Stats {
  accountCount: number;
  appCount: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

// Singleton instance
export const db = new LocalDatabase();
