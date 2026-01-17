//! GitHub platform adapter
//!
//! Handles OAuth and app discovery for GitHub accounts.
//! GitHub has excellent API support for listing authorized apps!

use super::{calculate_risk_level, ConnectedAccount, DiscoveredApp, Platform, PlatformError};
use serde::Deserialize;

// OAuth configuration
const CLIENT_ID: &str = "YOUR_GITHUB_CLIENT_ID";
const REDIRECT_URI: &str = "http://localhost:8742/callback/github";
const AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

// Scopes - we only need read access
const SCOPES: &[&str] = &["read:user", "user:email"];

pub struct GitHubPlatform {
    client: reqwest::Client,
}

impl GitHubPlatform {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("Complens/1.0")
                .build()
                .unwrap(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    login: String,
    email: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubApp {
    id: i64,
    name: String,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubGrant {
    id: i64,
    app: GitHubApp,
    scopes: Vec<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GitHubInstallation {
    id: i64,
    app_id: i64,
    app_slug: String,
    permissions: std::collections::HashMap<String, String>,
    created_at: String,
}

impl Platform for GitHubPlatform {
    fn get_auth_url(&self) -> Result<String, PlatformError> {
        let scopes = SCOPES.join(" ");
        let url = format!(
            "{}?client_id={}&redirect_uri={}&scope={}",
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
        ];

        let response: TokenResponse = self
            .client
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .form(&params)
            .send()
            .await?
            .json()
            .await?;

        // Get user info
        let user_info: GitHubUser = self
            .client
            .get("https://api.github.com/user")
            .bearer_auth(&response.access_token)
            .send()
            .await?
            .json()
            .await?;

        // Try to get email if not in profile
        let email = if user_info.email.is_some() {
            user_info.email.clone()
        } else {
            // Fetch from emails endpoint
            #[derive(Deserialize)]
            struct Email {
                email: String,
                primary: bool,
            }
            let emails: Vec<Email> = self
                .client
                .get("https://api.github.com/user/emails")
                .bearer_auth(&response.access_token)
                .send()
                .await
                .ok()
                .and_then(|r| futures::executor::block_on(r.json()).ok())
                .unwrap_or_default();

            emails
                .into_iter()
                .find(|e| e.primary)
                .map(|e| e.email)
                .or(user_info.email.clone())
        };

        Ok(ConnectedAccount {
            platform: "github".to_string(),
            email: email.unwrap_or_else(|| format!("{}@users.noreply.github.com", user_info.login)),
            display_name: user_info.name.or(Some(user_info.login)),
            access_token: response.access_token,
            refresh_token: None, // GitHub doesn't use refresh tokens for OAuth Apps
            token_expires_at: None,
            scopes: response
                .scope
                .map(|s| s.split(',').map(|s| s.to_string()).collect())
                .unwrap_or_default(),
        })
    }

    async fn refresh_token(&self, _refresh_token: &str) -> Result<ConnectedAccount, PlatformError> {
        // GitHub OAuth Apps don't expire, so no refresh needed
        Err(PlatformError::OAuthError(
            "GitHub tokens don't expire".to_string(),
        ))
    }

    async fn scan_apps(&self, access_token: &str) -> Result<Vec<DiscoveredApp>, PlatformError> {
        let mut apps = Vec::new();

        // 1. Get OAuth App authorizations (grants)
        // This endpoint shows apps the user has authorized via OAuth
        let grants_response = self
            .client
            .get("https://api.github.com/applications/grants")
            .bearer_auth(access_token)
            .send()
            .await;

        if let Ok(response) = grants_response {
            if response.status().is_success() {
                if let Ok(grants) = response.json::<Vec<GitHubGrant>>().await {
                    for grant in grants {
                        let (risk_level, risk_factors) =
                            calculate_risk_level(&grant.scopes, false);

                        apps.push(DiscoveredApp {
                            app_id: grant.id.to_string(),
                            name: grant.app.name,
                            publisher: None,
                            description: None,
                            homepage_url: grant.app.url,
                            icon_url: None,
                            permissions: grant.scopes,
                            consent_type: Some("oauth".to_string()),
                            consented_at: Some(grant.created_at),
                            risk_level,
                            risk_factors,
                            is_first_party: false,
                        });
                    }
                }
            }
        }

        // 2. Get GitHub App installations
        // This shows GitHub Apps installed on the user's account
        let installations_response = self
            .client
            .get("https://api.github.com/user/installations")
            .bearer_auth(access_token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await;

        if let Ok(response) = installations_response {
            if response.status().is_success() {
                #[derive(Deserialize)]
                struct InstallationsResponse {
                    installations: Vec<GitHubInstallation>,
                }

                if let Ok(data) = response.json::<InstallationsResponse>().await {
                    for installation in data.installations {
                        let permissions: Vec<String> = installation
                            .permissions
                            .iter()
                            .map(|(k, v)| format!("{}:{}", k, v))
                            .collect();

                        let (risk_level, risk_factors) =
                            calculate_risk_level(&permissions, false);

                        apps.push(DiscoveredApp {
                            app_id: format!("installation-{}", installation.id),
                            name: installation.app_slug.clone(),
                            publisher: None,
                            description: Some(format!("GitHub App: {}", installation.app_slug)),
                            homepage_url: Some(format!(
                                "https://github.com/apps/{}",
                                installation.app_slug
                            )),
                            icon_url: None,
                            permissions,
                            consent_type: Some("github_app".to_string()),
                            consented_at: Some(installation.created_at),
                            risk_level,
                            risk_factors,
                            is_first_party: false,
                        });
                    }
                }
            }
        }

        // If we couldn't get apps via API, add link to settings page
        if apps.is_empty() {
            apps.push(DiscoveredApp {
                app_id: "github-settings-page".to_string(),
                name: "View all apps at GitHub".to_string(),
                publisher: Some("GitHub".to_string()),
                description: Some(
                    "Click to view your authorized apps on GitHub settings."
                        .to_string(),
                ),
                homepage_url: Some("https://github.com/settings/applications".to_string()),
                icon_url: None,
                permissions: vec![],
                consent_type: None,
                consented_at: None,
                risk_level: "info".to_string(),
                risk_factors: vec![],
                is_first_party: true,
            });
        }

        Ok(apps)
    }

    async fn revoke_app(
        &self,
        access_token: &str,
        app_id: &str,
    ) -> Result<Option<String>, PlatformError> {
        // Try to revoke via API
        if app_id.starts_with("installation-") {
            // GitHub App installation - can be revoked via API
            let installation_id = app_id.strip_prefix("installation-").unwrap();
            let response = self
                .client
                .delete(&format!(
                    "https://api.github.com/user/installations/{}",
                    installation_id
                ))
                .bearer_auth(access_token)
                .send()
                .await?;

            if response.status().is_success() {
                return Ok(None); // Successfully revoked
            }
        }

        // OAuth grant - direct user to settings
        Ok(Some(
            "https://github.com/settings/applications".to_string(),
        ))
    }
}
