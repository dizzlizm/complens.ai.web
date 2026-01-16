# Complens.ai - Claude Code Guide

**Last Updated:** 2026-01-16
**Project:** Automated Compliance Security Service for SaaS Apps
**Vision:** "A Complete Lens for Cloud Security"

---

## Project Overview

Complens.ai is an AI-powered security evaluation platform that provides continuous, intelligent monitoring and assessment of cloud applications and services. Starting with Google Workspace, the platform will expand to cover other SaaS applications, providing threat detection, compliance monitoring, and security intelligence.

### Core Value Proposition
- **Intelligent Scanning**: Automatically scans Google Workspace (and future SaaS apps) for security threats
- **Threat Intelligence**: Integrates with NIST NVD, CISA KEV, EPSS for vulnerability intelligence
- **AI-Powered Analysis**: Uses Claude for security analysis and recommendations
- **Multi-Tenant SaaS**: Built for scale with full data isolation
- **Cost-Optimized**: Dual-model architecture (cheap for chat, powerful for security)

---

## Current State (Phase 1 Complete)

### What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| **AWS Infrastructure** | Working | VPC, Lambda, RDS, API Gateway, CloudFront |
| **Authentication** | Working | Cognito + JWT + auto-provisioning |
| **Chat Interface** | Working | Real-time chat with Bedrock AI |
| **Multi-Tenancy** | Working | Org-level isolation, RLS, audit logging |
| **Chrome Extension Analysis** | Working | Full permission/risk assessment |
| **NIST/CVE Intelligence** | Working | Search, lookup, AI analysis with caching |
| **Google OAuth Flow** | Partial | Connect/disconnect works, needs NAT for API calls |
| **CI/CD** | Configured | GitHub Actions ready, needs secrets |

### What's NOT Working / Incomplete

| Component | Status | Blocker |
|-----------|--------|---------|
| **Google Workspace Data Collection** | Stubbed | NAT Gateway disabled (~$32/mo) |
| **Background Workers** | Not Started | Needs Step Functions + EventBridge |
| **SAML/SSO** | Schema Only | Implementation pending |
| **Rate Limiting** | Not Started | No implementation |
| **WAF** | Not Started | CloudFront unprotected |
| **CloudWatch Alarms** | Not Started | No monitoring alerts |

---

## Technical Architecture

### Stack Summary

```
Frontend:     React 18 + Axios → CloudFront → S3
API:          API Gateway (HTTP API) → Lambda (Node.js 20)
Database:     RDS PostgreSQL 15.5 (private subnet)
AI:           Bedrock (Nova Lite for chat, Claude 3.5 Sonnet for security)
Auth:         Cognito (JWT) with auto-provisioning
Infra:        CloudFormation (IaC)
CI/CD:        GitHub Actions
```

### Key Files & Locations

```
infrastructure/cloudformation/
├── main.yaml                    # Full AWS infrastructure
├── parameters/dev.json          # Dev environment config
└── parameters/prod.json         # Production config

backend/lambda/api/
├── index.js                     # Main Lambda handler (routes)
├── handlers/                    # Route handlers
│   ├── chat.js                  # AI chat endpoint
│   ├── google-oauth.js          # Google OAuth flow
│   ├── security.js              # Security analysis endpoints
│   └── admin.js                 # User management
└── services/
    ├── bedrock.js               # Dual-model AI integration
    ├── database.js              # PostgreSQL with tenant isolation
    ├── tenant-context.js        # Multi-tenant context extraction
    ├── audit-logger.js          # Comprehensive audit logging
    ├── external-security-intel.js   # NIST/CVE/CISA integration
    └── google-workspace-security.js # GWS analysis (stubbed)

frontend/src/
├── App.js                       # Main React component
├── services/api.js              # API client
└── components/                  # UI components

scripts/                         # Utility scripts for deployment/debugging
docs/                            # Technical documentation
```

### Database Schema (Key Tables)

```sql
-- Multi-tenant isolation
organizations (id, name, domain, tier, features, rate_limit)
user_organizations (user_id, org_id, role, auth_provider)

-- Core data
conversations (id, user_id, org_id, title, metadata)
messages (id, conversation_id, role, content)

-- Security intel cache (24hr TTL)
security_intel (source, query_type, raw_data, ai_analysis, expires_at)

-- Audit & compliance
audit_logs (org_id, user_id, action, resource_type, ip_address, status)

-- Google Workspace (ready for data)
gws_users, gws_groups, gws_files
google_workspace_connections (org_id, access_token, refresh_token)

-- Chrome extensions
cws_extensions (permissions, risk_score)
cws_installations (org_id, extension_id, installed_by)

-- Security findings
findings (org_id, type, severity, resource, description)
```

---

## Development Guidelines

### Environment Setup

1. **GitHub Secrets Required:**
   ```
   AWS_ACCESS_KEY_ID
   AWS_SECRET_ACCESS_KEY
   DB_MASTER_PASSWORD
   BILLING_ALERT_EMAIL
   GOOGLE_CLIENT_ID (optional)
   GOOGLE_CLIENT_SECRET (optional)
   ```

2. **Local Development:**
   ```bash
   # Frontend
   cd frontend && npm install && npm start

   # Backend (for testing)
   cd backend/lambda/api && npm install && npm test
   ```

3. **Deployment:**
   ```bash
   # Via GitHub Actions (recommended)
   git push origin claude/<branch-name>
   # Then trigger workflow manually in GitHub UI

   # Or manual
   cd infrastructure/cloudformation && ./deploy.sh dev
   ```

### Code Patterns

**Tenant-Scoped Database Queries:**
```javascript
// Always include orgId in queries
const conversations = await databaseService.getConversations(userId, orgId);
const conversation = await databaseService.getConversation(convId, orgId);
```

**Handler Pattern:**
```javascript
async function handleRequest(event, user, tenantContext, services) {
  // tenantContext contains: { orgId, role, orgName, orgTier }
  // services contains: { bedrockService, databaseService, ... }
}
```

**Audit Logging:**
```javascript
await auditLoggerService.logSuccess({
  orgId, userId, action: 'resource.action',
  resourceType: 'type', resourceId: id
});
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| POST | /chat | Yes | AI chat (tenant-scoped) |
| GET | /conversations | Yes | List user conversations |
| GET | /conversations/:id | Yes | Get conversation |
| GET | /oauth/google/authorize | Yes | Start OAuth flow |
| GET | /oauth/google/callback | No | OAuth callback |
| POST | /oauth/google/disconnect | Yes | Disconnect workspace |
| GET | /oauth/google/status | Yes | Check connection |
| GET | /security/nist/search | Yes | Search NIST NVD |
| GET | /security/cve/:id | Yes | Get CVE details |
| GET | /security/chrome-extension/:id | Yes | Analyze extension |
| GET | /admin/users | Yes (Admin) | List org users |

---

## Known Issues & TODOs

### Recently Completed (2026-01-16)

1. **NAT Gateway** - ENABLED
   - External API calls now possible (Google Workspace, Chrome Web Store, NIST, etc.)
   - Cost: ~$32/month

2. **WAF on CloudFront** - ENABLED
   - DDoS protection via rate limiting (2000 req/5min per IP)
   - AWS Managed Rules: Common Rule Set, Known Bad Inputs, SQLi, IP Reputation
   - CloudWatch metrics enabled for monitoring

3. **API Gateway Rate Limiting** - ENABLED
   - Default: 20 req/sec (dev), 100 req/sec (prod)
   - Chat endpoint: 5 req/sec (dev), 20 req/sec (prod) - protects Bedrock costs
   - Security endpoints: 5 req/sec (dev), 10 req/sec (prod)

4. **CloudWatch Alarms** - ENABLED
   - Lambda errors (>5 in 5min)
   - Lambda duration (>25s approaching timeout)
   - API Gateway 5xx errors (>10 in 5min)
   - API Gateway 4xx errors (>50 in 5min)
   - RDS CPU utilization (>80%)
   - Billing alerts (>$100)

5. **CloudTrail** - ENABLED
   - Audit logging for all AWS API calls
   - Lambda invocations logged
   - S3 data events logged
   - Logs retained 90 days (dev), 365 days (prod)

6. **Google Workspace Security Analysis** - COMPLETE
   - OAuth flow: connect/disconnect/status
   - List users without 2FA (stores findings)
   - Find admin accounts
   - Analyze external file sharing (stores findings)
   - Check security policies with security score
   - Security summary from findings database
   - API Gateway routes with JWT auth added

### High Priority (Next Up)

1. **Background Workers Not Implemented**
   - Needed for: Autonomous scanning, scheduled security checks
   - Architecture: Step Functions + EventBridge + Lambda workers

2. **Frontend Security Dashboard**
   - Backend APIs ready, need UI to display findings
   - Security score visualization

### Medium Priority

3. **SAML/SSO Not Implemented**
   - Schema ready in `saml_providers` table
   - Needed for enterprise customers

4. **User Invitation Workflow**
   - Schema ready in `user_invitations` table
   - UI not built

5. **Frontend Admin UI Incomplete**
   - Structure exists, needs backend integration

6. **No Request Signing/API Keys**
   - Only JWT auth currently supported

### Low Priority

7. **Streaming Responses from Bedrock**
8. **WebSocket API for Real-Time Updates**
9. **Conversation Search**
10. **Custom Domain Setup**

---

## Security Considerations

### Implemented

- VPC with private subnets for Lambda/RDS
- RDS encryption at rest
- Secrets Manager for all credentials
- JWT authentication via Cognito
- Row-Level Security at database level
- Comprehensive audit logging (application + CloudTrail)
- IAM least privilege
- CloudFront HTTPS enforcement
- **WAF on CloudFront** (NEW)
  - Rate limiting: 2000 req/5min per IP
  - AWS Managed Rules: Common, Bad Inputs, SQLi, IP Reputation
- **API Gateway Rate Limiting** (NEW)
  - Default: 20 req/sec (dev), 100 req/sec (prod)
  - Stricter limits on expensive endpoints (chat, security)
- **CloudTrail** (NEW)
  - All AWS API calls logged
  - Lambda invocations tracked
  - S3 data events captured

### Needs Implementation

- [ ] API key authentication option
- [ ] Request signing for sensitive endpoints
- [ ] GuardDuty threat detection
- [ ] AWS Config compliance rules
- [ ] RDS Multi-AZ for production
- [ ] Content Security Policy (CSP) headers

### Security Threat Model

| Threat | Current Mitigation | Status |
|--------|-------------------|--------|
| SQL Injection | Parameterized queries + WAF SQLi rules | Protected |
| XSS | React auto-escaping + WAF Common Rules | Protected |
| CSRF | JWT in headers | Protected |
| DDoS | WAF rate limiting + API throttling | Protected |
| Data Exfiltration | RLS + tenant isolation | Protected |
| Credential Theft | Secrets Manager | Add rotation policy |
| Brute Force | WAF rate limiting + Cognito lockout | Protected |
| Bot Traffic | WAF IP Reputation + rate limits | Protected |

---

## Cost Management

### Current Dev Environment (~$80/month)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| RDS (db.t4g.micro) | ~$15 | Single-AZ, 20GB |
| NAT Gateway | ~$32 | Enabled for external APIs |
| VPC Endpoints (6x) | ~$42 | Secrets, Bedrock, S3, SSM x3 |
| WAF | ~$5 | Basic rules + rate limiting |
| CloudFront/S3 | <$5 | Free tier mostly |
| Lambda/API Gateway | Free tier | Low usage |
| CloudTrail | <$1 | S3 storage for logs |
| **Subtotal** | **~$80** | Excluding AI usage |
| Bedrock (Nova) | ~$5-10 | 98% cheaper than Claude |
| Bedrock (Claude) | Variable | Security analysis only |

### Cost Optimization Strategies

1. **Dual-Model Architecture** (Implemented)
   - Nova Lite for chat: $0.06/$0.24 per 1M tokens
   - Claude for security: $3/$15 per 1M tokens
   - **Result:** ~98% cost reduction on AI

2. **Rate Limiting** (Implemented)
   - Protects against runaway Bedrock costs
   - Chat endpoint limited to 5 req/sec (dev)
   - Prevents abuse that could spike bills

3. **Future Optimizations**
   - Aurora Serverless v2 for production (scale to zero)
   - Reserved concurrency for predictable Lambda costs
   - S3 Intelligent-Tiering for cold data
   - Spot instances for background workers

### Production Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| RDS Multi-AZ (t4g.medium) | ~$120 |
| NAT Gateway | ~$32 |
| VPC Endpoints (6x) | ~$42 |
| WAF | ~$10 |
| CloudWatch/CloudTrail | ~$15 |
| Lambda (high usage) | ~$20 |
| **Subtotal** | **~$240** |
| + Bedrock usage | Variable |

---

## Roadmap & Strategic Plan

### Phase 2: Google Workspace Integration (COMPLETE)

**Goal:** Enable actual security scanning of Google Workspace

**Tasks:**
1. ~~Enable NAT Gateway (+$32/month)~~ DONE
2. ~~Add WAF + Rate Limiting~~ DONE
3. ~~Complete Google OAuth scopes (Admin SDK, Drive, Gmail)~~ DONE
4. ~~Implement data collection:~~ DONE
   - ~~List users without 2FA~~ DONE
   - ~~Find admin accounts~~ DONE
   - ~~Analyze external file sharing~~ DONE
   - ~~Check security policies with security score~~ DONE
5. ~~Store findings in `findings` table~~ DONE
6. Build security dashboard UI - PENDING (backend ready)

**Dependencies:**
- ~~NAT Gateway for external API calls~~ READY
- Google Cloud Console setup with OAuth credentials (user must configure)
- Admin consent flow for Google Workspace (user must configure)

### Phase 3: Background Workers & Automation

**Goal:** Autonomous, continuous security scanning

**Architecture:**
```
EventBridge Scheduler (cron)
    ↓
Step Functions (orchestration)
    ↓
Lambda Workers (GWS, CWS, Intel)
    ↓
RDS (findings storage)
    ↓
SNS/SES (alerts)
```

**Tasks:**
1. Create Step Functions workflow
2. Implement EventBridge scheduled triggers
3. Build worker Lambdas:
   - GWS User Scanner
   - GWS Drive Scanner
   - CWS Extension Monitor
   - Threat Intel Updater
4. Alert system (SNS → Email/Slack)

### Phase 4: Advanced Security Features

**Goals:**
- Chrome Web Store scanning at scale
- MCP integration for Claude tool calling
- Real-time threat alerts
- Remediation workflows

**Tasks:**
1. CWS extension discovery and risk scoring
2. MCP server for Claude to query security data
3. WebSocket API for real-time dashboard
4. Automated remediation suggestions
5. Integration with ticketing systems

### Phase 5: Enterprise Features

**Goals:**
- SAML/SSO for enterprise customers
- Compliance frameworks (SOC2, GDPR, HIPAA)
- Advanced analytics and reporting
- White-label options

**Tasks:**
1. Implement SAML authentication
2. Compliance control mapping
3. Custom report generation
4. Benchmarking against industry standards
5. API for third-party integrations

### Phase 6: Platform Expansion

**Goals:**
- AWS security integration
- Azure AD/Microsoft 365 integration
- Slack/Teams notifications
- Multi-cloud security posture

---

## Infrastructure Decisions

### Why Serverless?
- **Cost:** Pay-per-use, no idle costs
- **Scale:** Automatic scaling to demand
- **Operations:** No servers to manage
- **Tradeoff:** Cold starts, VPC complexity

### Why PostgreSQL over DynamoDB?
- **Relational data:** Users, orgs, conversations have relationships
- **Complex queries:** Security analytics need JOINs
- **ACID compliance:** Data integrity matters
- **Tradeoff:** Connection pooling complexity in Lambda

### Why Bedrock over Self-Hosted?
- **No GPU management:** Pay-per-token
- **Latest models:** Claude access immediately
- **VPC integration:** Private endpoint available
- **Tradeoff:** Vendor lock-in, rate limits

### Why VPC Endpoints?
- **Cost:** Cheaper than NAT for AWS traffic (~$7/endpoint vs $32 NAT)
- **Security:** Traffic stays within AWS network
- **Tradeoff:** Only works for AWS services

---

## Monitoring & Observability

### Current (Minimal)

- CloudWatch Logs for Lambda
- API Gateway access logs
- RDS performance insights (basic)

### Recommended Implementation

1. **CloudWatch Alarms:**
   ```bash
   # Lambda errors > 5 in 5 minutes
   # API Gateway 5xx > 10 in 5 minutes
   # RDS CPU > 80%
   # Billing > $100/month
   ```

2. **X-Ray Tracing:**
   - Enable for Lambda
   - Trace database queries
   - Track Bedrock latency

3. **Custom Metrics:**
   - Tokens used per tenant
   - Security findings per org
   - Scan completion rate

4. **Dashboards:**
   - Operations dashboard
   - Cost dashboard
   - Security metrics dashboard

---

## Testing Strategy

### Current (Minimal)

- Manual testing via curl/Postman
- Basic Jest setup (not comprehensive)

### Recommended

1. **Unit Tests:**
   - Service layer functions
   - Tenant isolation logic
   - Data transformation

2. **Integration Tests:**
   - API endpoint testing
   - Database operations
   - Bedrock integration

3. **Security Tests:**
   - Tenant isolation verification
   - SQL injection testing
   - Authentication bypass attempts

4. **Load Tests:**
   - Lambda concurrent invocations
   - RDS connection limits
   - Bedrock rate limits

---

## Deployment Checklist

### Before First Deployment

- [ ] GitHub Secrets configured (AWS keys, DB password, billing email)
- [ ] Review CloudFormation parameters
- [ ] Verify AWS account limits (Lambda, RDS, Bedrock)

### Before Production

- [ ] Enable RDS Multi-AZ
- [ ] Enable NAT Gateway (if needed)
- [ ] Configure WAF rules
- [ ] Set up CloudWatch alarms
- [ ] Enable CloudTrail
- [ ] Configure backup retention
- [ ] Set up custom domain + ACM certificate
- [ ] Review IAM permissions
- [ ] Penetration testing

### Post-Deployment Verification

- [ ] Health endpoint returns 200
- [ ] Chat works with Bedrock
- [ ] Database connection successful
- [ ] Cognito auth flow works
- [ ] Audit logs being written
- [ ] CloudWatch logs appearing

---

## Quick Reference

### Useful Commands

```bash
# Check stack status
./scripts/check-stack.sh

# View Lambda logs
aws logs tail /aws/lambda/dev-complens-api --follow

# Connect to RDS (via bastion)
./scripts/get-rds-connection.sh

# Apply database migration
./scripts/apply-migration.sh <migration-file>

# Debug API issues
./scripts/debug-api.sh
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 403 on chat | No org mapping | User auto-provisioning should kick in |
| 502 Bad Gateway | Lambda timeout | Check Bedrock/RDS connectivity |
| CORS errors | Missing headers | Check Lambda OPTIONS handling |
| RDS connection refused | Security group | Verify Lambda SG → RDS SG rule |

### Key Metrics to Watch

- **Lambda Duration:** Should be <10s for chat
- **RDS Connections:** Should stay <50 for dev
- **Bedrock Latency:** 2-5s normal for Claude
- **Error Rate:** Should be <1%

---

## Contact & Resources

- **GitHub Issues:** Report bugs and feature requests
- **Documentation:** `/docs` folder
- **Architecture:** `docs/ARCHITECTURE.md`
- **Vision:** `docs/VISION.md`
- **Deployment:** `docs/DEPLOYMENT.md`

---

*This document should be updated as the project evolves. Last comprehensive review: 2026-01-16*

---

## Changelog

### 2026-01-16 - Production Hardening & GWS Completion
- Added WAF WebACL to CloudFront with 5 protection rules
- Implemented API Gateway rate limiting (default + per-route)
- Verified NAT Gateway, CloudWatch Alarms, CloudTrail already enabled
- Updated cost estimates to reflect new infrastructure (~$80/mo dev)
- Updated security threat model with new protections
- Completed Google Workspace security analysis implementation:
  - Added 5 GWS security routes to API Gateway with JWT auth
  - Implemented full checkSecurityPolicies() with security score (0-100)
  - All GWS security functions now call actual Google Admin SDK APIs
  - Findings are stored in database with severity levels
- Corrected documentation (GWS was mostly implemented, not stubbed)
