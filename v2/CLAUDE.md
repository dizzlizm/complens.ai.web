# CLAUDE.md - Complens.ai v2: OAuth App Audit

## Product Vision

**One-liner:** See every third-party app with access to your Microsoft 365 or Google Workspace. Find overprivileged, abandoned, and risky integrations in minutes.

**Problem:** Organizations unknowingly grant third-party apps access to sensitive data via OAuth. These apps accumulate over time, many become abandoned, and some have excessive permissions. Security teams have no visibility.

**Solution:** Connect your M365 or Google Workspace in 2 clicks. We enumerate all OAuth apps, their permissions, and risk level. Actionable recommendations to revoke unnecessary access.

---

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| IaC | AWS SAM | Simpler than raw CloudFormation, serverless-first |
| API | Lambda + API Gateway HTTP API | No VPC needed, pay-per-use |
| Database | DynamoDB | No connection pooling issues, no VPC needed |
| Auth | Cognito | Managed auth, JWT validation at API Gateway |
| Frontend | React + Vite | Fast dev experience, simple build |
| Hosting | S3 + CloudFront | Static hosting, global CDN |

**Key Design Decision:** No VPC = no NAT gateway = minimal costs (~$5/month vs $45+/month)

---

## Project Structure

```
v2/
├── template.yaml           # SAM template (all infrastructure)
├── samconfig.toml          # SAM deployment config
├── package.json            # Root package.json
├── src/
│   ├── functions/          # Lambda functions
│   │   ├── health/         # GET /health
│   │   ├── me/             # GET /me
│   │   ├── oauth-start/    # POST /oauth/start/{provider}
│   │   ├── oauth-callback/ # GET /oauth/callback/{provider}
│   │   ├── connections/    # GET/DELETE /connections
│   │   └── apps/           # GET /connections/{id}/apps, POST /scan
│   └── shared/             # Shared code
│       ├── response.js     # API response helpers
│       ├── db.js           # DynamoDB helpers
│       ├── auth.js         # JWT/auth helpers
│       └── microsoft.js    # Microsoft Graph API client
└── frontend/
    ├── src/
    │   ├── pages/          # Route pages
    │   ├── components/     # React components
    │   ├── hooks/          # Custom hooks (useAuth)
    │   └── services/       # API client
    └── package.json
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Get current user + connections |
| POST | /oauth/start/microsoft | Yes | Start Microsoft OAuth flow |
| GET | /oauth/callback/microsoft | No | OAuth callback (redirects to frontend) |
| GET | /connections | Yes | List user's connections |
| DELETE | /connections/{id} | Yes | Remove a connection |
| GET | /connections/{id}/apps | Yes | List discovered OAuth apps |
| POST | /connections/{id}/scan | Yes | Trigger new scan |

---

## DynamoDB Schema (Single Table)

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| User | USER#\<userId\> | PROFILE | EMAIL#\<email\> | USER#\<userId\> |
| Connection | USER#\<userId\> | CONN#\<connId\> | CONN#\<connId\> | USER#\<userId\> |
| OAuth App | CONN#\<connId\> | APP#\<appId\> | APP#\<appId\> | CONN#\<connId\> |
| Scan | CONN#\<connId\> | SCAN#\<timestamp\> | - | - |

---

## Development Commands

```bash
# Install dependencies
cd v2 && npm install
cd v2/frontend && npm install

# Local development
cd v2/frontend && npm run dev          # Frontend on localhost:3000
cd v2 && sam local start-api           # API on localhost:3000

# Build and deploy
cd v2 && sam build
cd v2 && sam deploy --config-env dev   # Deploy to dev
cd v2 && sam deploy --config-env prod  # Deploy to prod

# Deploy frontend
cd v2/frontend && npm run build
aws s3 sync dist/ s3://BUCKET_NAME --delete
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

---

## Microsoft Entra App Setup

1. Go to Azure Portal → Microsoft Entra ID → App registrations
2. New registration:
   - Name: Complens OAuth Audit
   - Supported account types: Accounts in any organizational directory
   - Redirect URI: `https://API_URL/oauth/callback/microsoft`

3. API permissions (Delegated):
   - `User.Read` - Sign in and read user profile
   - `Application.Read.All` - Read all applications
   - `Directory.Read.All` - Read directory data

4. Create client secret, store in AWS Secrets Manager

5. Update SAM parameters:
   ```bash
   sam deploy --parameter-overrides \
     MicrosoftClientId=YOUR_CLIENT_ID \
     MicrosoftClientSecretArn=arn:aws:secretsmanager:...
   ```

---

## Risk Scoring Logic

**High Risk** (red):
- Mail.ReadWrite, Mail.Send
- Files.ReadWrite.All
- Directory.ReadWrite.All
- User.ReadWrite.All
- Application.ReadWrite.All
- RoleManagement.ReadWrite.Directory

**Medium Risk** (yellow):
- Mail.Read
- Files.Read.All
- Calendars.ReadWrite
- Contacts.ReadWrite
- Directory.Read.All
- User.Read.All

**Low Risk** (green):
- Everything else

---

## Roadmap

### Phase 1: MVP (Current)
- [x] SAM infrastructure template
- [x] Microsoft 365 OAuth connection
- [x] Enumerate OAuth apps via Graph API
- [x] Risk scoring by permissions
- [x] Basic React frontend
- [ ] Deploy to dev environment
- [ ] Test with real M365 tenant

### Phase 2: Polish
- [ ] Google Workspace support
- [ ] App activity detection (unused apps)
- [ ] Export to CSV/PDF
- [ ] Email alerts for new high-risk apps
- [ ] Scheduled rescans

### Phase 3: Growth
- [ ] Team/organization features
- [ ] RBAC (admin vs viewer)
- [ ] Slack/Teams integration
- [ ] API access for automation

---

## Cost Estimate

| Resource | Dev | Prod |
|----------|-----|------|
| Lambda | ~$0 (free tier) | ~$1-5/mo |
| API Gateway | ~$0 | ~$1-5/mo |
| DynamoDB | ~$0 (on-demand) | ~$1-10/mo |
| CloudFront | ~$0 | ~$1-5/mo |
| S3 | ~$0.50/mo | ~$1/mo |
| Cognito | ~$0 (free tier) | ~$0-5/mo |
| Secrets Manager | ~$0.40/mo | ~$0.40/mo |
| **Total** | **~$1/mo** | **~$5-30/mo** |

Compare to v1 with RDS + VPC: ~$45-270/mo

---

## Security Considerations

1. **Token Storage**: OAuth tokens stored in DynamoDB. Consider encrypting sensitive fields with KMS for production.

2. **Principle of Least Privilege**: Only request necessary Microsoft Graph permissions. Read-only by design.

3. **Token Refresh**: Tokens are refreshed automatically when expired. Refresh tokens stored securely.

4. **Multi-tenancy**: User data isolated by userId in DynamoDB partition key. No cross-user data leakage possible.

5. **Rate Limiting**: API Gateway throttling configured (20 burst / 10 rps dev, 100/50 prod).

---

## Testing Checklist

- [ ] Sign up / Login flow works
- [ ] Microsoft OAuth flow completes
- [ ] OAuth apps are enumerated correctly
- [ ] Risk levels are calculated correctly
- [ ] Connection can be deleted
- [ ] Token refresh works when expired
- [ ] Error states handled gracefully
