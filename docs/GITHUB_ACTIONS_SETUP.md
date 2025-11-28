# Quick Setup Guide for GitHub Actions Deployment

This guide shows you exactly where to put your secrets when using GitHub Actions.

## Step 1: Get Route53 Hosted Zone ID

Run this locally (or check AWS Console):
```bash
aws route53 list-hosted-zones --query "HostedZones[?Name=='complens.ai.'].Id" --output text
```

You'll get something like: `/hostedzone/Z1234567890ABC`

**Update this file**: `infrastructure/cloudformation/parameters/dev.json` line 24
```json
{
  "ParameterKey": "HostedZoneId",
  "ParameterValue": "/hostedzone/Z1234567890ABC"  // <-- Your actual zone ID
}
```

Commit and push this change.

## Step 2: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable these APIs:
   - Admin SDK API
   - Google Drive API
   - Google Workspace Admin SDK
   - Google Workspace Reports API

4. Go to **APIs & Services** → **OAuth consent screen**
   - Select "Internal" (for Workspace org) or "External"
   - App name: `Complens.ai Security`
   - Add scopes:
     ```
     https://www.googleapis.com/auth/admin.directory.user.readonly
     https://www.googleapis.com/auth/admin.directory.group.readonly
     https://www.googleapis.com/auth/drive.readonly
     https://www.googleapis.com/auth/admin.reports.audit.readonly
     https://www.googleapis.com/auth/userinfo.email
     https://www.googleapis.com/auth/userinfo.profile
     ```

5. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `Complens.ai Web App`
   - Authorized redirect URIs:
     ```
     https://dev.complens.ai/api/oauth/google/callback
     ```

6. **Copy your credentials**:
   - Client ID: `xxxxx.apps.googleusercontent.com`
   - Client Secret: `xxxxx`

## Step 3: Add Secrets to GitHub

Go to your repo: **Settings** → **Secrets and variables** → **Actions**

Click **"New repository secret"** and add these two secrets:

| Name | Value | Example |
|------|-------|---------|
| `GOOGLE_CLIENT_ID` | Your OAuth client ID | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret | `GOCSPX-abc123xyz789` |

## Step 4: Deploy

Push your code to trigger GitHub Actions:

```bash
git push
```

Or manually trigger:
1. Go to **Actions** tab in GitHub
2. Select "Deploy Complens.ai" workflow
3. Click "Run workflow"
4. Select branch: `claude/frontend-improvements-01GHzpEpbgqhKTYE2KcZhqKA`
5. Click "Run workflow"

## What Happens During Deployment

```
GitHub Actions Workflow:
  1. Deploy CloudFormation stack
     ↓
  2. Create AWS Secrets Manager secret (with DB credentials)
     ↓
  3. **NEW STEP**: Update secret with Google OAuth credentials
     - Reads GOOGLE_CLIENT_ID from GitHub Secrets
     - Reads GOOGLE_CLIENT_SECRET from GitHub Secrets
     - Adds to AWS Secrets Manager
     - Auto-configures redirect URI based on CloudFront URL
     ↓
  4. Deploy Lambda backend
     ↓
  5. Deploy frontend
```

## How Secrets Flow

```
GitHub Secrets (deployment time)
  ├─ GOOGLE_CLIENT_ID ────────────┐
  └─ GOOGLE_CLIENT_SECRET ────────┤
                                   │
                                   ▼
                    AWS Secrets Manager (runtime)
                    {
                      "dbHost": "...",
                      "dbPassword": "...",
                      "googleClientId": "...",      ◄── Added by workflow
                      "googleClientSecret": "...",   ◄── Added by workflow
                      "googleRedirectUri": "...",    ◄── Auto-configured
                      "frontendUrl": "..."           ◄── Auto-configured
                    }
                                   │
                                   ▼
                    Lambda (reads from Secrets Manager)
                      ├─ Sets process.env.GOOGLE_CLIENT_ID
                      ├─ Sets process.env.GOOGLE_CLIENT_SECRET
                      ├─ Sets process.env.GOOGLE_REDIRECT_URI
                      └─ Sets process.env.FRONTEND_URL
                                   │
                                   ▼
                    OAuth Service (uses environment variables)
```

## Verify Deployment

After GitHub Actions completes:

1. **Check CloudFormation outputs**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name complens-dev \
     --query 'Stacks[0].Outputs' \
     --output table
   ```

2. **Check Secrets Manager**:
   ```bash
   aws secretsmanager get-secret-value \
     --secret-id dev/complens/app-secrets \
     --query SecretString \
     --output text | jq .
   ```

   You should see `googleClientId`, `googleClientSecret`, etc.

3. **Test the API**:
   ```bash
   curl https://dev.complens.ai/health
   ```

4. **Visit your app**:
   ```
   https://dev.complens.ai
   ```

## Troubleshooting

### "GOOGLE_CLIENT_ID not found in GitHub Secrets"

The workflow will show a warning but continue. Add the secrets to GitHub and re-run the workflow.

### "redirect_uri_mismatch" when connecting Google

Make sure the redirect URI in Google Cloud Console **exactly matches**:
```
https://dev.complens.ai/api/oauth/google/callback
```

No trailing slash, must be HTTPS, must include `/api/oauth/google/callback`.

### Secrets Manager doesn't have Google credentials

Re-run the GitHub Actions workflow. The new step will add them automatically.

## Production Deployment

When ready for production:

1. Add production secrets to GitHub Secrets (same names)
2. Update `infrastructure/cloudformation/parameters/prod.json`
3. Add production redirect URI to Google Cloud Console:
   ```
   https://app.complens.ai/api/oauth/google/callback
   ```
4. Push to `main` branch (or manually trigger workflow with `prod` environment)

---

**That's it!** Your secrets are managed securely:
- ✅ GitHub Secrets (for deployment)
- ✅ AWS Secrets Manager (for runtime)
- ✅ No secrets in code
- ✅ Automatic configuration
