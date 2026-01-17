# CLAUDE.md - Complens.ai Consumer App

## What is Complens?

Complens.ai is a **mobile-first consumer privacy app** that helps everyday people understand and control what third-party apps have access to their digital accounts (Google, Microsoft, Facebook, GitHub, etc.).

Think of it as a "privacy dashboard" - connect your accounts once, and we'll show you every app that can access your data, with AI-powered risk scoring and one-tap revocation.

## Target User

- **Primary**: Privacy-conscious consumers (25-45)
- **Pain point**: "I have no idea what apps have access to my Google account"
- **Value prop**: "See everything. Control everything. 60 seconds."

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + TailwindCSS (PWA) |
| Hosting | S3 + CloudFront (dev.complens.ai / app.complens.ai) |
| API | API Gateway HTTP API + Lambda |
| Database | DynamoDB (single-table, serverless) |
| Auth | AWS Cognito (email + Google + Facebook) |
| AI | Amazon Bedrock (Claude for chat/analysis) |
| IaC | AWS SAM |

**No VPC. No NAT Gateway. No RDS.** = ~$10/month at low scale.

## Project Structure

```
v3/
├── template.yaml              # SAM template (infra as code)
├── samconfig.toml             # Deployment config
├── backend/
│   └── src/
│       ├── index.js           # All API routes
│       └── package.json
└── frontend/
    ├── src/
    │   ├── App.tsx            # Router + Amplify auth
    │   ├── components/
    │   │   ├── Layout.tsx     # Mobile nav shell
    │   │   └── ui/            # Component library
    │   │       ├── Button.tsx
    │   │       ├── Card.tsx
    │   │       ├── Badge.tsx
    │   │       ├── Modal.tsx
    │   │       ├── Tabs.tsx
    │   │       ├── Input.tsx
    │   │       ├── Avatar.tsx
    │   │       ├── States.tsx # Loading/Empty/Error states
    │   │       └── index.ts   # Exports
    │   ├── pages/
    │   │   ├── Dashboard.tsx  # Home with risk overview
    │   │   ├── Accounts.tsx   # Connected accounts
    │   │   ├── Apps.tsx       # Discovered apps + filters
    │   │   ├── Chat.tsx       # AI privacy assistant
    │   │   └── Settings.tsx   # User preferences
    │   ├── services/
    │   │   └── api.ts         # API client with auth
    │   └── index.css          # Design system + TailwindCSS
    └── package.json
```

## Commands

```bash
# Deploy backend (from v3/)
sam build && sam deploy

# Run frontend locally (from v3/frontend/)
npm install && npm run dev

# Deploy frontend (after build)
aws s3 sync dist/ s3://$BUCKET --delete
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

## Deployment Parameters

When deploying, you need:

| Parameter | Description | Example |
|-----------|-------------|---------|
| HostedZoneId | Route53 zone for complens.ai | Z0123456ABCDEFG |
| GoogleClientId | From Google Cloud Console | xxx.apps.googleusercontent.com |
| GoogleClientSecret | From Google Cloud Console | GOCSPX-xxx |
| FacebookAppId | From Facebook Developer | 123456789 |
| FacebookAppSecret | From Facebook Developer | abc123 |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Get user profile |
| PUT | /me | Yes | Update settings |
| GET | /accounts | Yes | List connected accounts |
| POST | /accounts | Yes | Connect new account |
| DELETE | /accounts/{id} | Yes | Disconnect account |
| GET | /apps | Yes | List discovered apps |
| POST | /scan | Yes | Trigger account scan |
| GET | /scan/{id} | Yes | Get scan status |
| POST | /chat | Yes | AI chat |

## DynamoDB Schema

Single-table design:

| Entity | PK | SK |
|--------|----|----|
| User | `USER#{userId}` | `PROFILE` |
| Account | `USER#{userId}` | `ACCOUNT#{accountId}` |
| App | `USER#{userId}` | `APP#{accountId}#{appId}` |
| Scan | `USER#{userId}` | `SCAN#{scanId}` |

## Design Principles

1. **Mobile-first, mobile-only** - Optimize for phones. Desktop is secondary.
2. **60-second time-to-value** - User should see their first risk within a minute.
3. **Visual risk scoring** - Red/yellow/green. No jargon.
4. **AI-powered explanations** - "This app can read your email" not "mail.read scope".
5. **One-tap actions** - Revoke access should be instant (where possible).

---

# ROADMAP

## Phase 1: Foundation (Current)
- [x] SAM template with Cognito + DynamoDB + Lambda
- [x] CloudFront + Route53 + ACM for custom domains
- [x] Social sign-in (Google, Facebook)
- [x] Mobile-first React PWA
- [x] UI component library
- [ ] Deploy to dev.complens.ai

## Phase 2: Core Scanning
- [ ] Google OAuth flow (list authorized apps)
- [ ] Microsoft OAuth flow (list authorized apps)
- [ ] GitHub OAuth flow (list grants + installations)
- [ ] Risk scoring algorithm
- [ ] App detail pages with permission breakdown

## Phase 3: Actions & Intelligence
- [ ] Direct app revocation (where APIs allow)
- [ ] Redirect to provider's app management page (fallback)
- [ ] AI chat with context awareness
- [ ] Proactive risk alerts (new high-risk app detected)
- [ ] Weekly privacy digest email

## Phase 4: Expansion
- [ ] Facebook/Instagram connected apps
- [ ] Slack workspace apps
- [ ] Twitter/X connected apps
- [ ] LinkedIn apps
- [ ] Dropbox connected apps

## Phase 5: Agentic Features
- [ ] AI agent that monitors for new app connections
- [ ] Automatic risk assessment of new apps
- [ ] Smart recommendations ("You haven't used X in 6 months, revoke?")
- [ ] Privacy score trending over time

## Phase 6: Social & Heuristics
- [ ] Social media privacy settings audit
- [ ] "Who can see your posts" analysis
- [ ] Web scraping for data broker presence
- [ ] Have I Been Pwned integration
- [ ] Dark web monitoring (partner integration)

---

# NOTES FOR FUTURE DEVELOPMENT

## Social Sign-In as Scanning Permission

When users sign in with Google/Facebook, we're already getting OAuth consent. Consider:
- Requesting broader scopes during sign-in
- User signs in with Google → we already have permission to list their apps
- Reduces friction vs. separate "connect" flow

## Platform API Limitations

| Platform | Can List Apps? | Can Revoke? | Notes |
|----------|---------------|-------------|-------|
| Google | Limited | No | Redirect to myaccount.google.com/permissions |
| Microsoft | Limited | No | Redirect to account.live.com/consent/Manage |
| GitHub | Yes | Yes | Full API support |
| Facebook | Yes | Yes | Apps using your info endpoint |
| Slack | Yes | Partial | Workspace admin may restrict |

## Heuristic Scanning Ideas

Beyond API-based discovery:
- Email pattern analysis ("Your app X was authorized...")
- Browser extension for real-time monitoring
- Calendar invite analysis for third-party schedulers
- Chrome/Safari saved passwords for connected services

---

# ENVIRONMENT VARIABLES

Frontend (`.env`):
```
VITE_USER_POOL_ID=us-east-1_xxx
VITE_USER_POOL_CLIENT_ID=xxx
VITE_COGNITO_DOMAIN=https://complens-dev-xxx.auth.us-east-1.amazoncognito.com
VITE_API_URL=https://api-dev.complens.ai
```

Lambda (via SAM template):
```
ENVIRONMENT=dev
TABLE_NAME=complens-dev
USER_POOL_ID=us-east-1_xxx
USER_POOL_CLIENT_ID=xxx
```
