# CLAUDE.md - Complens.ai Project Guide

## Project Overview

Complens.ai is a multi-tenant AI Security Platform (SaaS) that provides security analysis, compliance monitoring, and AI-powered chat capabilities.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, React Router v6, hosted on S3 + CloudFront |
| Backend | AWS Lambda (Node.js 20.x), API Gateway HTTP API v2 |
| Database | Amazon RDS PostgreSQL 15.7 |
| Auth | AWS Cognito (JWT validation at API Gateway) |
| AI | Amazon Bedrock (Nova Lite for chat, Claude 3.5 Sonnet for security analysis) |
| IaC | AWS CloudFormation |
| CI/CD | GitHub Actions |

## Project Structure

```
complens.ai/
├── frontend/                    # React SPA
│   └── src/
│       ├── components/          # React components
│       ├── pages/               # Route pages
│       └── services/            # API client
├── backend/
│   ├── lambda/api/
│   │   ├── index.js             # Main Lambda handler (1,773 lines)
│   │   └── services/            # Service modules
│   │       ├── database.js      # PostgreSQL connection pool
│   │       ├── tenant-context.js # Multi-tenant isolation
│   │       ├── bedrock.js       # AI model integration
│   │       ├── security-intel.js # CVE/NIST lookups
│   │       └── google-workspace.js # GWS integration
│   └── database/
│       └── migrations/          # SQL migration files
├── infrastructure/
│   └── cloudformation/          # AWS CloudFormation templates
└── .github/workflows/           # CI/CD pipelines
```

## Key Files

- `backend/lambda/api/index.js` - Main API handler, all 25+ endpoints
- `backend/lambda/api/services/database.js` - DB connection pool config
- `backend/lambda/api/services/tenant-context.js` - Multi-tenant context and RLS helpers
- `infrastructure/cloudformation/main.yaml` - Primary CloudFormation template

## Development Commands

```bash
# Frontend (local dev)
cd frontend && npm install && npm start     # Dev server on localhost:3000
cd frontend && npm run build                # Production build

# Backend (local testing)
cd backend/lambda/api && npm install
cd backend/lambda/api && npm test           # Run tests

# Database migrations (via bastion)
./run-migrations.sh                         # On bastion host
```

## Deployment Commands

### PowerShell (Windows - from laptop)
```powershell
# Deploy everything to dev
.\scripts\Deploy-Complens.ps1 -Environment dev

# Quick Lambda-only deploy (fastest)
.\scripts\Deploy-Lambda.ps1 -Environment dev

# Deploy specific component
.\scripts\Deploy-Complens.ps1 -Environment prod -Component backend
.\scripts\Deploy-Complens.ps1 -Component infra      # Infrastructure only
.\scripts\Deploy-Complens.ps1 -Component frontend   # Frontend only
```

### Bash (Linux/Mac/WSL)
```bash
# Infrastructure
cd infrastructure/cloudformation && ./deploy.sh dev

# Lambda only (fast)
./scripts/deploy-lambda.sh

# Frontend
./scripts/deploy-frontend-with-cognito.sh
```

### GitHub Actions (automatic)
- Push to `claude/**` branch → auto-deploys to dev
- Manual trigger → choose dev or prod

## Architecture Notes

### Authentication Flow
```
User → Cognito Login → JWT Token → API Gateway validates JWT
  → Lambda extracts claims (sub, email) → TenantContextService resolves org
  → Auto-provision org if first-time user → Inject tenantContext into request
```

### Multi-Tenancy
- All data isolated by `org_id` column
- Row-Level Security (RLS) policies enabled with helper methods
- Users can belong to multiple orgs (user_organizations table)

### Database Tables (27 total)
Key tables: `organizations`, `user_organizations`, `conversations`, `messages`, `findings`, `audit_logs`, `security_intel`

---

# HOW TO USE THIS FILE

This file is automatically loaded at the start of every Claude Code session. You can:
- Say "work on item #4" to tackle a specific backlog item
- Say "fix the critical issues" to address security priorities
- Say "what's the status?" to get an overview

---

# TECHNICAL DEBT BACKLOG

## Critical Priority (Security)

### 1. ~~SSL Certificate Validation Disabled~~ ✅ FIXED
**File:** `backend/lambda/api/services/database.js:21`
**Status:** Fixed - now uses `rejectUnauthorized: true`

### 2. ~~Row-Level Security Not Enforced~~ ✅ FIXED
**File:** `backend/lambda/api/services/database.js`
**Status:** Fixed - added `queryWithRLS()` and `getClientWithRLS()` helper methods
**Usage:**
```javascript
// For simple queries with RLS:
const result = await db.queryWithRLS(orgId, 'SELECT * FROM conversations', []);

// For transactions with RLS:
const client = await db.getClientWithRLS(orgId);
try {
  // RLS policies automatically filter by org_id
  await client.query('BEGIN');
  // ... your queries
  await client.query('COMMIT');
} finally {
  client.release();
}
```

### 3. ~~No API Rate Limiting~~ ✅ FIXED
**File:** `infrastructure/cloudformation/main.yaml`
**Status:** Fixed - added throttling to API Gateway Stage
- Default: 50 burst / 25 rps (dev), 200 burst / 100 rps (prod)
- /chat endpoint: 10 burst / 5 rps (dev), 50 burst / 20 rps (prod)

## High Priority (Performance)

### 4. Lambda Connection Pool Bottleneck
**File:** `backend/lambda/api/services/database.js:17`
**Issue:** `max: 2` connections per Lambda = bottleneck under load
**Fix:** Implement RDS Proxy
**Steps:**
1. Add RDS Proxy to CloudFormation template
2. Update Lambda to connect via proxy endpoint
3. Increase pool size (proxy handles actual pooling)
4. Test under load

### 5. N+1 Query in User Listing
**File:** `backend/lambda/api/index.js` - /admin/users endpoint
**Issue:** Fetches Cognito users then separately queries user_organizations
**Fix:** Optimize with JOIN or batch query

## Medium Priority (Operational)

### 6. Audit Log Silent Failures
**File:** `backend/lambda/api/services/audit-log.js`
**Issue:** Failures caught and logged but not alerted
**Fix:** Add CloudWatch metric/alarm for audit failures

### 7. No Distributed Tracing
**Issue:** X-Ray not configured, hard to debug cross-service issues
**Fix:** Enable X-Ray in Lambda and API Gateway

### 8. ~~CORS Origins Hardcoded~~ ✅ FIXED
**File:** `backend/lambda/api/index.js`, `infrastructure/cloudformation/main.yaml`
**Status:** Fixed - now reads from `CORS_ALLOWED_ORIGINS` environment variable

### 9. Manual Database Migrations
**Issue:** No automated migration tracking
**Fix:** Implement migration versioning (schema_migrations table exists)

## Low Priority (Tech Debt)

### 10. No OpenAPI Specification
**Fix:** Generate OpenAPI spec from existing endpoints

### 11. API Key Rotation
**Issue:** Service account API keys never expire
**Fix:** Add expiration field and rotation mechanism

### 12. Bedrock Response Streaming
**Issue:** Full responses only, no streaming for long analyses
**Fix:** Implement streaming for /chat endpoint

---

# SERVERLESS MIGRATION NOTES

## Current State
- Already serverless on compute (Lambda + API Gateway)
- Database is RDS PostgreSQL (not serverless)

## Recommended Path (NOT full rewrite)

### Option A: Keep PostgreSQL, Add RDS Proxy
- **Effort:** 1-2 days
- **Cost:** +$20/month
- **Benefit:** Fixes connection pooling, minimal code changes

### Option B: Migrate to Aurora Serverless v2
- **Effort:** 1 week
- **Cost:** Variable (~$43/mo minimum, scales with load)
- **Benefit:** True serverless database, same PostgreSQL compatibility

### NOT Recommended: DynamoDB Migration
- **Effort:** 2-3 months
- **Risk:** Data model is relational, would require complete redesign
- **Issue:** Conversations → Messages, Users → Organizations are relational patterns

---

# COST REFERENCE

| Environment | Current Cost | With RDS Proxy |
|-------------|--------------|----------------|
| Dev | ~$25/month | ~$45/month |
| Prod | ~$200-250/month | ~$220-270/month |

Major cost drivers:
- RDS instance: $15 (dev) / $120 (prod)
- VPC Endpoints: $21/month
- Bedrock: Pay-per-token (~$5-50/month depending on usage)

---

# ENVIRONMENT VARIABLES

Required in Lambda:
- `DB_SECRET_ARN` - Secrets Manager ARN for database credentials
- `COGNITO_USER_POOL_ID` - Cognito user pool
- `BEDROCK_REGION` - Region for Bedrock API calls
- `ENVIRONMENT` - dev/prod

---

# TESTING

```bash
# Health check
curl https://api.dev.complens.ai/health

# Debug endpoint (requires auth)
curl -H "Authorization: Bearer $TOKEN" https://api.dev.complens.ai/debug/me
```

---

# SECURITY CHECKLIST

- [x] SSL certificate validation enabled (rejectUnauthorized: true)
- [x] RLS policies actively enforced (via queryWithRLS/getClientWithRLS)
- [x] API rate limiting configured (50 burst/25 rps dev, 200/100 prod)
- [ ] Audit logs monitored for failures
- [ ] Secrets rotated regularly
- [x] VPC endpoints in use (no public internet for AWS services)
- [x] Database in private subnet
- [x] CloudFront HTTPS-only
