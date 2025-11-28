# Google OAuth Setup Guide

This guide walks you through setting up OAuth 2.0 for Google Workspace integration with Complens.ai.

## Overview

Complens.ai uses OAuth 2.0 to connect to Google Workspace. This is the **modern, recommended approach** because:

✅ Users explicitly approve scopes (transparent)
✅ No service account JSON keys to secure
✅ Standard OAuth flow (simpler)
✅ Easy to revoke access
✅ Tokens stored encrypted in database
✅ Better security posture

## Prerequisites

- Google Workspace admin account
- Access to Google Cloud Console
- Complens.ai deployed to AWS (with domain configured)

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Enter project name: `complens-security` (or your preference)
4. Click "Create"
5. Select your new project from the dropdown

## Step 2: Enable Required APIs

1. Go to **APIs & Services** → **Library**
2. Search for and enable these APIs:
   - **Admin SDK API**
   - **Google Drive API**
   - **Google Workspace Admin SDK**
   - **Google Workspace Reports API**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **Internal** (for Google Workspace org) or **External** (for public use)
3. Click "Create"

### Fill in App Information:

**App name**: `Complens.ai Security`
**User support email**: Your email
**App logo**: (Optional) Upload Complens.ai logo
**Application home page**: `https://dev.complens.ai` (or your domain)
**Application privacy policy**: `https://dev.complens.ai/privacy` (create this)
**Application terms of service**: `https://dev.complens.ai/terms` (create this)
**Authorized domains**: `complens.ai`
**Developer contact email**: Your email

Click "Save and Continue"

### Add Scopes:

Click "Add or Remove Scopes" and add these:

```
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.group.readonly
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/admin.reports.audit.readonly
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

**Description of each scope:**
- **admin.directory.user.readonly**: Read user information (for 2FA status, admin detection)
- **admin.directory.group.readonly**: Read group information (for group membership analysis)
- **drive.readonly**: Read Drive files (for sharing analysis)
- **admin.reports.audit.readonly**: Read audit logs (for security event detection)
- **userinfo.email**: Get user's email (for connection tracking)
- **userinfo.profile**: Get user's name (for UI display)

Click "Update" → "Save and Continue"

### Add Test Users (for External apps only):

If you selected "External", add test user emails that can connect during testing.

Click "Save and Continue"

## Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: `Complens.ai Web App`

### Authorized JavaScript origins:

```
https://dev.complens.ai
```

(Add production domain when ready: `https://app.complens.ai`)

### Authorized redirect URIs:

```
https://dev.complens.ai/api/oauth/google/callback
```

(Add production when ready: `https://app.complens.ai/api/oauth/google/callback`)

5. Click "Create"

### Save Your Credentials:

You'll see a popup with:
- **Client ID**: `xxxxx.apps.googleusercontent.com`
- **Client Secret**: `xxxxx`

**IMPORTANT**: Copy these immediately! You'll need them for the next step.

## Step 5: Store Credentials in AWS Secrets Manager

Your credentials should be stored securely in AWS Secrets Manager, not in environment variables.

### Option A: Via AWS Console

1. Go to AWS Secrets Manager console
2. Find the secret: `dev/complens/app-secrets`
3. Click "Retrieve secret value" → "Edit"
4. Add these keys:
   ```json
   {
     "dbUsername": "complensadmin",
     "dbPassword": "...",
     "dbHost": "...",
     "dbPort": "5432",
     "dbName": "complens",
     "googleClientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "googleClientSecret": "YOUR_CLIENT_SECRET",
     "googleRedirectUri": "https://dev.complens.ai/api/oauth/google/callback",
     "frontendUrl": "https://dev.complens.ai"
   }
   ```
5. Click "Save"

### Option B: Via AWS CLI

```bash
# Get current secret value
CURRENT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id dev/complens/app-secrets \
  --query SecretString \
  --output text)

# Update with new values (merge with existing)
NEW_SECRET=$(echo $CURRENT_SECRET | jq '. + {
  "googleClientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "googleClientSecret": "YOUR_CLIENT_SECRET",
  "googleRedirectUri": "https://dev.complens.ai/api/oauth/google/callback",
  "frontendUrl": "https://dev.complens.ai"
}')

# Save updated secret
aws secretsmanager update-secret \
  --secret-id dev/complens/app-secrets \
  --secret-string "$NEW_SECRET"
```

## Step 6: Update Lambda Environment Variables

The Lambda function needs to load these from Secrets Manager.

### Update CloudFormation Template:

In `infrastructure/cloudformation/main.yaml`, update the Lambda environment variables (when you uncomment the Lambda function):

```yaml
Environment:
  Variables:
    SECRETS_ARN: !Ref ApplicationSecrets
    REGION: !Ref AWS::Region
```

The Lambda will automatically load:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`

from the Secrets Manager secret.

### Update Secrets Service:

In `backend/lambda/api/services/secrets.js`, ensure it's extracting these values:

```javascript
async getSecrets() {
  // ... existing code ...

  return {
    dbHost: secretData.dbHost,
    dbPort: secretData.dbPort,
    dbName: secretData.dbName,
    dbUsername: secretData.dbUsername,
    dbPassword: secretData.dbPassword,
    googleClientId: secretData.googleClientId,
    googleClientSecret: secretData.googleClientSecret,
    googleRedirectUri: secretData.googleRedirectUri,
    frontendUrl: secretData.frontendUrl,
  };
}
```

Then in `index.js` initialization:

```javascript
process.env.GOOGLE_CLIENT_ID = secrets.googleClientId;
process.env.GOOGLE_CLIENT_SECRET = secrets.googleClientSecret;
process.env.GOOGLE_REDIRECT_URI = secrets.googleRedirectUri;
process.env.FRONTEND_URL = secrets.frontendUrl;
```

## Step 7: Add "Connect Google Workspace" Button to Frontend

In your React app (`frontend/src/App.js`), add a connect button:

```jsx
const handleConnectGoogle = async () => {
  // Replace 'demo-org-id' with actual org ID from your system
  const orgId = 'demo-org-id';

  // Redirect to OAuth authorize endpoint
  window.location.href = `${API_URL}/oauth/google/authorize?orgId=${orgId}`;
};

// In your render:
<button onClick={handleConnectGoogle}>
  Connect Google Workspace
</button>
```

## Step 8: Test the OAuth Flow

1. **Deploy your updated infrastructure**:
   ```bash
   cd infrastructure/cloudformation
   ./deploy.sh dev
   ```

2. **Deploy backend Lambda** (with OAuth code)

3. **Open your frontend**: `https://dev.complens.ai`

4. **Click "Connect Google Workspace"**

5. **You'll be redirected to Google's consent screen**:
   - Shows app name "Complens.ai Security"
   - Lists all requested scopes
   - Shows your Google Workspace domain

6. **Click "Allow"**

7. **Redirected back to frontend** with success message

8. **Tokens are stored** in database table `google_workspace_connections`

## Step 9: Verify Connection

Check database:

```sql
SELECT
  connected_email,
  connected_at,
  token_expiry > NOW() as token_valid
FROM google_workspace_connections
WHERE org_id = 'demo-org-id';
```

You should see:
- Your email address
- Connection timestamp
- `token_valid: true`

## Step 10: Test MCP Server

Once connected, the MCP server can now access Google Workspace:

```bash
# The MCP server will automatically fetch tokens from database
# and refresh them if expired

# Test a tool call via Claude in the UI:
"Show me all users without 2FA"
```

Claude will use the MCP server, which fetches OAuth tokens from the database.

## Troubleshooting

### "redirect_uri_mismatch" error

**Problem**: The redirect URI doesn't match what's configured in Google Cloud Console.

**Solution**:
1. Check that `GOOGLE_REDIRECT_URI` exactly matches the URI in Google Cloud Console
2. Must be HTTPS (not HTTP) in production
3. Must include the full path: `/api/oauth/google/callback`

### "access_denied" error

**Problem**: User clicked "Deny" on consent screen.

**Solution**: Try connecting again. User must click "Allow".

### "invalid_grant" error

**Problem**: Refresh token is invalid or revoked.

**Solution**:
1. Disconnect in UI (revokes tokens)
2. Connect again (generates new tokens)

### Token expired errors

**Problem**: Access token expired and refresh failed.

**Solution**: The MCP server should automatically refresh tokens. Check:
1. Refresh token is stored in database
2. MCP server has correct `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
3. Network connectivity to Google APIs

## Security Best Practices

1. **Never commit credentials** - Use AWS Secrets Manager
2. **Use HTTPS** - All redirect URIs must be HTTPS in production
3. **Encrypt tokens** - Store access/refresh tokens encrypted in database
4. **Rotate secrets** - Periodically rotate client secret in Google Cloud Console
5. **Audit access** - Log all OAuth connections/disconnections in `audit_events` table
6. **Limit scopes** - Only request scopes you actually need
7. **Monitor usage** - Set up alerts for suspicious OAuth activity

## Revoking Access

### User-initiated:

User clicks "Disconnect" button in UI → Calls `/oauth/google/disconnect` → Revokes tokens with Google

### Admin-initiated:

Admin can revoke access in Google Workspace Admin Console:
1. **Security** → **API Controls** → **App access control**
2. Find "Complens.ai Security"
3. Click "Remove access"

## Production Deployment

When deploying to production:

1. Update OAuth consent screen to "Published" status
2. Add production domain to authorized JavaScript origins
3. Add production redirect URI
4. Create new secret in AWS Secrets Manager: `prod/complens/app-secrets`
5. Update production CloudFormation parameters with domain name
6. Test OAuth flow in production

---

**Questions?** Contact the Complens.ai team or check the [main documentation](../README.md).
