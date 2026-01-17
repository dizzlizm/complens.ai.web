//! Microsoft platform adapter
//!
//! Handles OAuth and app discovery for Microsoft personal accounts.
//! Uses Microsoft Graph API to list third-party apps.

use super::{calculate_risk_level, ConnectedAccount, DiscoveredApp, Platform, PlatformError};
use serde::Deserialize;

// OAuth configuration
const CLIENT_ID: &str = "YOUR_MICROSOFT_CLIENT_ID";
const REDIRECT_URI: &str = "http://localhost:8742/callback/microsoft";
const AUTH_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

// Scopes for personal Microsoft accounts
const SCOPES: &[&str] = &[
    "openid",
    "email",
    "profile",
    "offline_access",
    "User.Read",
];

pub struct MicrosoftPlatform {
    client: reqwest::Client,
}

impl MicrosoftPlatform {
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
    #[serde(rename = "userPrincipalName")]
    user_principal_name: Option<String>,
    mail: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OAuthPermissionGrant {
    id: String,
    #[serde(rename = "clientId")]
    client_id: String,
    #[serde(rename = "consentType")]
    consent_type: Option<String>,
    scope: Option<String>,
    #[serde(rename = "principalId")]
    principal_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ServicePrincipal {
    id: String,
    #[serde(rename = "appId")]
    app_id: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "appDisplayName")]
    app_display_name: Option<String>,
    #[serde(rename = "publisherName")]
    publisher_name: Option<String>,
    homepage: Option<String>,
    #[serde(rename = "appOwnerOrganizationId")]
    app_owner_org_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphResponse<T> {
    value: Vec<T>,
    #[serde(rename = "@odata.nextLink")]
    next_link: Option<String>,
}

// Microsoft first-party org IDs
const MICROSOFT_ORG_IDS: &[&str] = &[
    "f8cdef31-a31e-4b4a-93e4-5f571e91255a",
    "72f988bf-86f1-41af-91ab-2d7cd011db47",
];

impl Platform for MicrosoftPlatform {
    fn get_auth_url(&self) -> Result<String, PlatformError> {
        let scopes = SCOPES.join(" ");
        let url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&response_mode=query",
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
            ("scope", &SCOPES.join(" ")),
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
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(&response.access_token)
            .send()
            .await?
            .json()
            .await?;

        let email = user_info
            .mail
            .or(user_info.user_principal_name)
            .unwrap_or_default();

        Ok(ConnectedAccount {
            platform: "microsoft".to_string(),
            email,
            display_name: user_info.display_name,
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
            ("scope", &SCOPES.join(" ")),
        ];

        let response: TokenResponse = self
            .client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .await?
            .json()
            .await?;

        let user_info: UserInfo = self
            .client
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(&response.access_token)
            .send()
            .await?
            .json()
            .await?;

        let email = user_info
            .mail
            .or(user_info.user_principal_name)
            .unwrap_or_default();

        Ok(ConnectedAccount {
            platform: "microsoft".to_string(),
            email,
            display_name: user_info.display_name,
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
        // For personal Microsoft accounts, we can't use the same Graph APIs
        // as enterprise (no servicePrincipals endpoint for consumers)
        //
        // Instead, direct users to the Microsoft consent management page
        // https://account.live.com/consent/Manage

        let mut apps = Vec::new();

        // Check what we can access with current token
        let me_response = self
            .client
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(access_token)
            .send()
            .await;

        if me_response.is_ok() {
            // Token is valid - we can at least confirm the connection works
            apps.push(DiscoveredApp {
                app_id: "complens-scanner".to_string(),
                name: "Complens (this app)".to_string(),
                publisher: Some("Complens".to_string()),
                description: Some("This is the Complens app you're using to scan.".to_string()),
                homepage_url: Some("https://complens.ai".to_string()),
                icon_url: None,
                permissions: SCOPES.iter().map(|s| s.to_string()).collect(),
                consent_type: Some("user".to_string()),
                consented_at: None,
                risk_level: "low".to_string(),
                risk_factors: vec![],
                is_first_party: false,
            });
        }

        // Add link to Microsoft's consent management
        apps.push(DiscoveredApp {
            app_id: "microsoft-consent-page".to_string(),
            name: "View all apps at Microsoft".to_string(),
            publisher: Some("Microsoft".to_string()),
            description: Some(
                "Microsoft personal accounts require manual review. \
                 Click to view your connected apps directly on Microsoft."
                    .to_string(),
            ),
            homepage_url: Some("https://account.live.com/consent/Manage".to_string()),
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
        // Microsoft requires manual revocation through their UI
        Ok(Some(
            "https://account.live.com/consent/Manage".to_string(),
        ))
    }
}
