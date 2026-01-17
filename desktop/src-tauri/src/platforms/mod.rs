//! Platform adapters for OAuth and app discovery
//!
//! Each platform (Google, Microsoft, GitHub, etc.) has its own module
//! that implements the Platform trait.

pub mod google;
pub mod microsoft;
pub mod github;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PlatformError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("OAuth error: {0}")]
    OAuthError(String),

    #[error("Platform not supported: {0}")]
    UnsupportedPlatform(String),

    #[error("API error: {0}")]
    ApiError(String),
}

/// Information about a connected account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedAccount {
    pub platform: String,
    pub email: String,
    pub display_name: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<String>,
    pub scopes: Vec<String>,
}

/// A third-party app discovered with OAuth access
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredApp {
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
}

/// Trait that all platform adapters must implement
pub trait Platform {
    /// Get the OAuth authorization URL to start the flow
    fn get_auth_url(&self) -> Result<String, PlatformError>;

    /// Exchange authorization code for tokens
    fn exchange_code(&self, code: &str) -> impl std::future::Future<Output = Result<ConnectedAccount, PlatformError>> + Send;

    /// Refresh an expired access token
    fn refresh_token(&self, refresh_token: &str) -> impl std::future::Future<Output = Result<ConnectedAccount, PlatformError>> + Send;

    /// Scan for third-party apps with OAuth access
    fn scan_apps(&self, access_token: &str) -> impl std::future::Future<Output = Result<Vec<DiscoveredApp>, PlatformError>> + Send;

    /// Revoke an app's access (returns URL to revoke page if direct revoke not possible)
    fn revoke_app(&self, access_token: &str, app_id: &str) -> impl std::future::Future<Output = Result<Option<String>, PlatformError>> + Send;
}

/// Get OAuth authorization URL for a platform
pub fn get_auth_url(platform: &str) -> Result<String, PlatformError> {
    match platform {
        "google" => google::GooglePlatform::new().get_auth_url(),
        "microsoft" => microsoft::MicrosoftPlatform::new().get_auth_url(),
        "github" => github::GitHubPlatform::new().get_auth_url(),
        _ => Err(PlatformError::UnsupportedPlatform(platform.to_string())),
    }
}

/// Scan apps for a platform
pub async fn scan(platform: &str, access_token: &str) -> Result<Vec<DiscoveredApp>, PlatformError> {
    match platform {
        "google" => google::GooglePlatform::new().scan_apps(access_token).await,
        "microsoft" => microsoft::MicrosoftPlatform::new().scan_apps(access_token).await,
        "github" => github::GitHubPlatform::new().scan_apps(access_token).await,
        _ => Err(PlatformError::UnsupportedPlatform(platform.to_string())),
    }
}

/// Calculate risk level based on permissions
pub fn calculate_risk_level(permissions: &[String], is_first_party: bool) -> (String, Vec<String>) {
    let mut risk_factors = Vec::new();

    // High risk permission patterns (across platforms)
    let high_risk_patterns = [
        "mail.send", "mail.readwrite", "gmail.send", "gmail.modify",
        "files.readwrite", "drive.file", "drive",
        "admin", "directory.readwrite", "user.readwrite",
        "repo", "delete", "write:org",
    ];

    // Medium risk patterns
    let medium_risk_patterns = [
        "mail.read", "gmail.readonly", "calendar.readwrite",
        "contacts", "files.read", "drive.readonly",
        "user.read", "profile", "read:org", "read:user",
    ];

    let perms_lower: Vec<String> = permissions.iter().map(|p| p.to_lowercase()).collect();

    // Check for high risk
    for pattern in high_risk_patterns {
        if perms_lower.iter().any(|p| p.contains(pattern)) {
            risk_factors.push(format!("Has high-risk permission: {}", pattern));
        }
    }

    // Check for medium risk
    for pattern in medium_risk_patterns {
        if perms_lower.iter().any(|p| p.contains(pattern)) && risk_factors.is_empty() {
            risk_factors.push(format!("Has sensitive permission: {}", pattern));
        }
    }

    // Determine risk level
    let risk_level = if risk_factors.iter().any(|f| f.contains("high-risk")) {
        if is_first_party { "medium" } else { "high" }
    } else if !risk_factors.is_empty() {
        "medium"
    } else {
        "low"
    };

    (risk_level.to_string(), risk_factors)
}
