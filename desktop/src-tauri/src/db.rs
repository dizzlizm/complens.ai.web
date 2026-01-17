//! Local SQLite database for storing accounts and discovered apps
//!
//! All data is stored locally on the user's device for privacy.

use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn connection(&self) -> std::sync::MutexGuard<Connection> {
        self.conn.lock().unwrap()
    }
}

/// Initialize the database with schema
pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_dir = app
        .path_resolver()
        .app_data_dir()
        .expect("failed to get app data dir");

    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("complens.db");

    let conn = Connection::open(&db_path)?;

    // Create tables
    conn.execute_batch(
        r#"
        -- Connected accounts (Google, Microsoft, GitHub, etc.)
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,  -- 'google', 'microsoft', 'github', etc.
            email TEXT NOT NULL,
            display_name TEXT,
            access_token TEXT,       -- Encrypted
            refresh_token TEXT,      -- Encrypted
            token_expires_at TEXT,
            scopes TEXT,             -- JSON array
            connected_at TEXT NOT NULL,
            last_scanned_at TEXT,
            is_active INTEGER DEFAULT 1
        );

        -- Discovered third-party apps with OAuth access
        CREATE TABLE IF NOT EXISTS apps (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            app_id TEXT NOT NULL,         -- Platform-specific app ID
            name TEXT NOT NULL,
            publisher TEXT,
            description TEXT,
            homepage_url TEXT,
            icon_url TEXT,
            permissions TEXT,             -- JSON array of permission scopes
            consent_type TEXT,            -- 'user' or 'admin'
            consented_at TEXT,
            risk_level TEXT,              -- 'low', 'medium', 'high', 'critical'
            risk_factors TEXT,            -- JSON array of risk reasons
            is_first_party INTEGER,       -- Is it from the platform itself?
            discovered_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            is_revoked INTEGER DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            UNIQUE(account_id, app_id)
        );

        -- Scan history
        CREATE TABLE IF NOT EXISTS scans (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,         -- 'running', 'completed', 'failed'
            apps_found INTEGER DEFAULT 0,
            high_risk_count INTEGER DEFAULT 0,
            error_message TEXT,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        -- User settings
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Default settings
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('notifications_enabled', 'true'),
            ('auto_scan_interval', '0'),  -- 0 = disabled, otherwise hours
            ('theme', 'system'),
            ('sync_enabled', 'false');

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_apps_account ON apps(account_id);
        CREATE INDEX IF NOT EXISTS idx_apps_risk ON apps(risk_level);
        CREATE INDEX IF NOT EXISTS idx_scans_account ON scans(account_id);
        "#,
    )?;

    // Store database in app state
    let database = Database::new(db_path)?;
    app.manage(database);

    Ok(())
}
