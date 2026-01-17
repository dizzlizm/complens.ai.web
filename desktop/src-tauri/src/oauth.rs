//! OAuth callback server
//!
//! Runs a local HTTP server to receive OAuth callbacks.
//! This allows us to complete the OAuth flow without requiring
//! a hosted redirect URI.

use std::sync::Arc;
use tokio::sync::oneshot;

/// Start a local server to handle OAuth callbacks
/// Returns the authorization code when received
pub async fn wait_for_callback(port: u16) -> Result<(String, String), String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| e.to_string())?;

    let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;

    let mut stream = stream;
    let mut buffer = vec![0u8; 4096];
    let n = stream.read(&mut buffer).await.map_err(|e| e.to_string())?;

    let request = String::from_utf8_lossy(&buffer[..n]);

    // Parse the request to get the callback path
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    // Extract platform from path (e.g., /callback/google)
    let platform = path
        .strip_prefix("/callback/")
        .and_then(|p| p.split('?').next())
        .unwrap_or("unknown")
        .to_string();

    // Extract code from query string
    let code = url::Url::parse(&format!("http://localhost{}", path))
        .ok()
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.to_string())
        })
        .ok_or("No authorization code in callback")?;

    // Send success response
    let response = r#"HTTP/1.1 200 OK
Content-Type: text/html

<!DOCTYPE html>
<html>
<head>
    <title>Complens - Connected!</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center; height: 100vh;
               margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
        .card { background: white; padding: 40px; border-radius: 16px; text-align: center;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; }
        .checkmark { font-size: 48px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="checkmark">✓</div>
        <h1>Connected!</h1>
        <p>You can close this window and return to Complens.</p>
    </div>
</body>
</html>"#;

    stream
        .write_all(response.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    Ok((platform, code))
}

/// Default callback port
pub const CALLBACK_PORT: u16 = 8742;
