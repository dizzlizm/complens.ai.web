//! Tauri command handlers - the bridge between frontend and backend

use crate::db::Database;
use crate::platforms::{self, Platform, ConnectedAccount, DiscoveredApp};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub platform: String,
    pub email: String,
    pub display_name: Option<String>,
    pub connected_at: String,
    pub last_scanned_at: Option<String>,
    pub app_count: i32,
    pub high_risk_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct App {
    pub id: String,
    pub account_id: String,
    pub app_id: String,
    pub name: String,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub homepage_url: Option<String>,
    pub icon_url: Option<String>,
    pub permissions: Vec<String>,
    pub consent_type: Option<String>,
    pub consented_at: Option<String>,
    pub risk_level: String,
    pub risk_factors: Vec<String>,
    pub is_first_party: bool,
    pub discovered_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub account_id: String,
    pub apps_found: i32,
    pub high_risk_count: i32,
    pub medium_risk_count: i32,
    pub low_risk_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    pub notifications_enabled: bool,
    pub auto_scan_interval: i32,
    pub theme: String,
    pub sync_enabled: bool,
}

// ========================================
// Account Management Commands
// ========================================

#[tauri::command]
pub async fn get_accounts(db: State<'_, Database>) -> Result<Vec<Account>, String> {
    let conn = db.connection();

    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                a.id, a.platform, a.email, a.display_name,
                a.connected_at, a.last_scanned_at,
                COUNT(ap.id) as app_count,
                SUM(CASE WHEN ap.risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) as high_risk_count
            FROM accounts a
            LEFT JOIN apps ap ON a.id = ap.account_id AND ap.is_revoked = 0
            WHERE a.is_active = 1
            GROUP BY a.id
            ORDER BY a.connected_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                platform: row.get(1)?,
                email: row.get(2)?,
                display_name: row.get(3)?,
                connected_at: row.get(4)?,
                last_scanned_at: row.get(5)?,
                app_count: row.get(6)?,
                high_risk_count: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(accounts)
}

#[tauri::command]
pub async fn add_account(platform: String) -> Result<String, String> {
    // This initiates OAuth flow - returns auth URL to open in browser
    let auth_url = platforms::get_auth_url(&platform).map_err(|e| e.to_string())?;
    Ok(auth_url)
}

#[tauri::command]
pub async fn remove_account(db: State<'_, Database>, account_id: String) -> Result<(), String> {
    let conn = db.connection();

    conn.execute(
        "UPDATE accounts SET is_active = 0 WHERE id = ?",
        [&account_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn refresh_account(
    db: State<'_, Database>,
    account_id: String,
) -> Result<Account, String> {
    // Refresh OAuth tokens for an account
    // TODO: Implement token refresh logic
    Err("Not implemented yet".to_string())
}

// ========================================
// App Scanning Commands
// ========================================

#[tauri::command]
pub async fn scan_account(
    db: State<'_, Database>,
    account_id: String,
) -> Result<ScanResult, String> {
    // Get account details
    let conn = db.connection();

    let (platform, access_token): (String, String) = conn
        .query_row(
            "SELECT platform, access_token FROM accounts WHERE id = ?",
            [&account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    // Get platform adapter and scan
    let apps = platforms::scan(&platform, &access_token)
        .await
        .map_err(|e| e.to_string())?;

    // Store apps in database
    let now = chrono::Utc::now().to_rfc3339();

    for app in &apps {
        conn.execute(
            r#"
            INSERT OR REPLACE INTO apps
            (id, account_id, app_id, name, publisher, description, homepage_url, icon_url,
             permissions, consent_type, consented_at, risk_level, risk_factors,
             is_first_party, discovered_at, last_seen_at, is_revoked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            "#,
            rusqlite::params![
                format!("{}:{}", account_id, app.app_id),
                account_id,
                app.app_id,
                app.name,
                app.publisher,
                app.description,
                app.homepage_url,
                app.icon_url,
                serde_json::to_string(&app.permissions).unwrap_or_default(),
                app.consent_type,
                app.consented_at,
                app.risk_level,
                serde_json::to_string(&app.risk_factors).unwrap_or_default(),
                app.is_first_party,
                &now,
                &now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    // Update last scanned time
    conn.execute(
        "UPDATE accounts SET last_scanned_at = ? WHERE id = ?",
        [&now, &account_id],
    )
    .map_err(|e| e.to_string())?;

    // Calculate summary
    let high_risk = apps.iter().filter(|a| a.risk_level == "high" || a.risk_level == "critical").count() as i32;
    let medium_risk = apps.iter().filter(|a| a.risk_level == "medium").count() as i32;
    let low_risk = apps.iter().filter(|a| a.risk_level == "low").count() as i32;

    Ok(ScanResult {
        account_id,
        apps_found: apps.len() as i32,
        high_risk_count: high_risk,
        medium_risk_count: medium_risk,
        low_risk_count: low_risk,
    })
}

#[tauri::command]
pub async fn get_apps(
    db: State<'_, Database>,
    account_id: Option<String>,
    risk_level: Option<String>,
) -> Result<Vec<App>, String> {
    let conn = db.connection();

    let mut sql = String::from(
        r#"
        SELECT id, account_id, app_id, name, publisher, description, homepage_url, icon_url,
               permissions, consent_type, consented_at, risk_level, risk_factors,
               is_first_party, discovered_at
        FROM apps
        WHERE is_revoked = 0
        "#,
    );

    let mut params: Vec<String> = Vec::new();

    if let Some(aid) = &account_id {
        sql.push_str(" AND account_id = ?");
        params.push(aid.clone());
    }

    if let Some(risk) = &risk_level {
        sql.push_str(" AND risk_level = ?");
        params.push(risk.clone());
    }

    sql.push_str(" ORDER BY CASE risk_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, name");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let param_refs: Vec<&dyn rusqlite::ToSql> = params
        .iter()
        .map(|s| s as &dyn rusqlite::ToSql)
        .collect();

    let apps = stmt
        .query_map(param_refs.as_slice(), |row| {
            let permissions_json: String = row.get(8)?;
            let risk_factors_json: String = row.get(12)?;

            Ok(App {
                id: row.get(0)?,
                account_id: row.get(1)?,
                app_id: row.get(2)?,
                name: row.get(3)?,
                publisher: row.get(4)?,
                description: row.get(5)?,
                homepage_url: row.get(6)?,
                icon_url: row.get(7)?,
                permissions: serde_json::from_str(&permissions_json).unwrap_or_default(),
                consent_type: row.get(9)?,
                consented_at: row.get(10)?,
                risk_level: row.get(11)?,
                risk_factors: serde_json::from_str(&risk_factors_json).unwrap_or_default(),
                is_first_party: row.get::<_, i32>(13)? == 1,
                discovered_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(apps)
}

#[tauri::command]
pub async fn revoke_app(db: State<'_, Database>, app_id: String) -> Result<(), String> {
    // Get app details
    let conn = db.connection();

    let (account_id, platform_app_id, platform): (String, String, String) = conn
        .query_row(
            r#"
            SELECT ap.account_id, ap.app_id, a.platform
            FROM apps ap
            JOIN accounts a ON ap.account_id = a.id
            WHERE ap.id = ?
            "#,
            [&app_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    // TODO: Call platform API to revoke
    // For now, just mark as revoked in our database
    // The actual revocation would need to redirect user to platform's revoke page

    conn.execute(
        "UPDATE apps SET is_revoked = 1 WHERE id = ?",
        [&app_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ========================================
// Settings Commands
// ========================================

#[tauri::command]
pub async fn get_settings(db: State<'_, Database>) -> Result<Settings, String> {
    let conn = db.connection();

    let get_setting = |key: &str| -> String {
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?",
            [key],
            |row| row.get(0),
        )
        .unwrap_or_default()
    };

    Ok(Settings {
        notifications_enabled: get_setting("notifications_enabled") == "true",
        auto_scan_interval: get_setting("auto_scan_interval").parse().unwrap_or(0),
        theme: get_setting("theme"),
        sync_enabled: get_setting("sync_enabled") == "true",
    })
}

#[tauri::command]
pub async fn update_settings(db: State<'_, Database>, settings: Settings) -> Result<(), String> {
    let conn = db.connection();

    conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'notifications_enabled'",
        [settings.notifications_enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'auto_scan_interval'",
        [settings.auto_scan_interval.to_string()],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'theme'",
        [&settings.theme],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE settings SET value = ? WHERE key = 'sync_enabled'",
        [settings.sync_enabled.to_string()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
