//! Complens - See everything that has access to your digital life
//!
//! A privacy-focused desktop app that shows you all third-party apps
//! with OAuth access to your accounts (Google, Microsoft, GitHub, etc.)

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod oauth;
mod platforms;
mod commands;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle();
            db::init(&app_handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account management
            commands::get_accounts,
            commands::add_account,
            commands::remove_account,
            commands::refresh_account,
            // App scanning
            commands::scan_account,
            commands::get_apps,
            commands::revoke_app,
            // Settings
            commands::get_settings,
            commands::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
