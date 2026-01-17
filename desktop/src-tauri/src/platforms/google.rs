//! Google platform adapter
//!
//! Handles OAuth and app discovery for Google accounts.
//! Uses the Google OAuth2 API to list third-party apps with access.

use super::{calculate_risk_level, ConnectedAccount, DiscoveredApp, Platform, PlatformError};
use serde::Deserialize;

// OAuth configuration - these would come from environment/config in production
const CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID";
const REDIRECT_URI: &str = "http://localhost:8742/callback/google";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

// Scopes needed to view third-party app access
// We need to be able to read the user's authorized apps
const SCOPES: &[&str] = &[
    "openid",
    "email",
    "profile",
    // This scope lets us see what apps have access
    "https://www.googleapis.com/auth/userinfo.email",
];

pub struct GooglePlatform {
    client: reqwest::Client,
}

impl GooglePlatform {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct UserInfo {
    email: String,
    name: Option<String>,
}

// Google doesn't have a direct API to list third-party apps
// We have to scrape from the security page or use a workaround
// For now, we'll document that users need to check:
// https://myaccount.google.com/permissions

#[derive(Debug, Deserialize)]
struct AppsResponse {
    // Google's third-party apps API response structure
    // This is a placeholder - actual API structure may vary
    apps: Option<Vec<GoogleApp>>,
}

#[derive(Debug, Deserialize)]
struct GoogleApp {
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "displayText")]
    display_text: Option<String>,
    #[serde(rename = "productUrl")]
    product_url: Option<String>,
    scopes: Option<Vec<String>>,
}

impl Platform for GooglePlatform {
    fn get_auth_url(&self) -> Result<String, PlatformError> {
        let scopes = SCOPES.join(" ");
        let url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            AUTH_URL,
            CLIENT_ID,
            urlencoding::encode(REDIRECT_URI),
            urlencoding::encode(&scopes)
        );
        Ok(url)
    }

    async fn exchange_code(&self, code: &str) -> Result<ConnectedAccount, PlatformError> {
        let params = [
            ("code", code),
            ("client_id", CLIENT_ID),
            ("redirect_uri", REDIRECT_URI),
            ("grant_type", "authorization_code"),
        ];

        let response: TokenResponse = self
            .client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await?
            .json()
            .await?;

        // Get user info
        let user_info: UserInfo = self
            .client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(&response.access_token)
            .send()
            .await?
            .json()
            .await?;

        Ok(ConnectedAccount {
            platform: "google".to_string(),
            email: user_info.email,
            display_name: user_info.name,
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            token_expires_at: response.expires_in.map(|e| {
                chrono::Utc::now()
                    .checked_add_signed(chrono::Duration::seconds(e))
                    .map(|t| t.to_rfc3339())
                    .unwrap_or_default()
            }),
            scopes: SCOPES.iter().map(|s| s.to_string()).collect(),
        })
    }

    async fn refresh_token(&self, refresh_token: &str) -> Result<ConnectedAccount, PlatformError> {
        let params = [
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
        ];

        let response: TokenResponse = self
            .client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await?
            .json()
            .await?;

        // Get user info with new token
        let user_info: UserInfo = self
            .client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(&response.access_token)
            .send()
            .await?
            .json()
            .await?;

        Ok(ConnectedAccount {
            platform: "google".to_string(),
            email: user_info.email,
            display_name: user_info.name,
            access_token: response.access_token,
            refresh_token: response.refresh_token.or(Some(refresh_token.to_string())),
            token_expires_at: response.expires_in.map(|e| {
                chrono::Utc::now()
                    .checked_add_signed(chrono::Duration::seconds(e))
                    .map(|t| t.to_rfc3339())
                    .unwrap_or_default()
            }),
            scopes: SCOPES.iter().map(|s| s.to_string()).collect(),
        })
    }

    async fn scan_apps(&self, access_token: &str) -> Result<Vec<DiscoveredApp>, PlatformError> {
        // NOTE: Google doesn't have a public API to list third-party apps
        // with OAuth access to a consumer account.
        //
        // Options:
        // 1. Direct user to https://myaccount.google.com/permissions
        // 2. Use Google Takeout API (complex)
        // 3. Use unofficial/undocumented APIs (risky)
        //
        // For now, we'll return instructions to manually check
        // In production, we might use browser automation or partner APIs

        // Try to get token info to at least show what scopes we have
        let token_info_url = format!(
            "https://oauth2.googleapis.com/tokeninfo?access_token={}",
            access_token
        );

        let token_response = self.client.get(&token_info_url).send().await;

        let mut apps = Vec::new();

        // Add a placeholder entry directing user to Google's permissions page
        apps.push(DiscoveredApp {
            app_id: "google-permissions-page".to_string(),
            name: "View all apps at Google".to_string(),
            publisher: Some("Google".to_string()),
            description: Some(
                "Google doesn't provide an API to list third-party apps. \
                 Click to view your connected apps directly on Google."
                    .to_string(),
            ),
            homepage_url: Some("https://myaccount.google.com/permissions".to_string()),
            icon_url: None,
            permissions: vec![],
            consent_type: None,
            consented_at: None,
            risk_level: "info".to_string(),
            risk_factors: vec!["Manual review required".to_string()],
            is_first_party: true,
        });

        Ok(apps)
    }

    async fn revoke_app(
        &self,
        _access_token: &str,
        _app_id: &str,
    ) -> Result<Option<String>, PlatformError> {
        // Google requires manual revocation through their UI
        Ok(Some(
            "https://myaccount.google.com/permissions".to_string(),
        ))
    }
}
