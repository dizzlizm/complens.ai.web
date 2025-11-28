# Complens.ai - Product Vision

**"A Complete Lens for Cloud Security"**

## Vision Statement

Complens.ai is an AI-powered security evaluation platform that provides continuous, intelligent monitoring and assessment of cloud applications and services. By combining advanced AI reasoning with autonomous background workers, Complens delivers real-time security insights for small businesses and enterprises.

## The Big Picture

### What We're Building

A **dynamic security intelligence platform** that:

1. **Continuously learns** about your cloud environment
2. **Automatically discovers** security issues and misconfigurations
3. **Intelligently analyzes** using AI-powered security models
4. **Dynamically presents** findings through an adaptive UI
5. **Proactively monitors** changes and emerging threats

### Core Concept: "The Complete Lens"

Like a lens that brings clarity to complexity, Complens.ai provides a clear, comprehensive view of your organization's security posture by:

- **Connecting** to all your cloud services
- **Analyzing** configurations, permissions, and vulnerabilities
- **Learning** patterns and anomalies continuously
- **Presenting** actionable insights in real-time
- **Evolving** with your environment

## Product Architecture

### Phase 1: Foundation (Current)
**Timeline**: Months 1-2

✅ **Serverless infrastructure**
- VPC with private subnets
- Lambda functions for API
- RDS PostgreSQL for data storage
- Bedrock integration (Claude Sonnet 4)
- React frontend with chat interface

✅ **Cost-optimized dev environment**
- No NAT Gateway (~$18/month)
- VPC endpoints only
- Pay-as-you-go Bedrock

### Phase 2: Core Security Platform
**Timeline**: Months 3-4

🚧 **Google Workspace Integration**
- OAuth 2.0 authentication
- Admin SDK integration
- User and group enumeration
- Drive sharing analysis
- Gmail security settings
- Calendar permissions audit

🚧 **Chrome Web Store Monitoring**
- Extension discovery and analysis
- Permission evaluation
- Update tracking
- Risk scoring

🚧 **Background Workers (MCP-based)**
- Autonomous data collection agents
- Scheduled security scans
- Continuous learning pipeline
- Database population workers

### Phase 3: Advanced Intelligence
**Timeline**: Months 5-6

🔮 **Dynamic UI Components**
- Real-time security dashboard
- Interactive data visualizations
- Custom report generation
- Anomaly alerts and notifications

🔮 **MCP Tool Ecosystem**
- Custom MCP servers for each integration
- Tool calling from Claude
- Structured data extraction
- Automated remediation suggestions

### Phase 4: Enterprise Features
**Timeline**: Months 7-9

🔮 **Multi-tenant Architecture**
- Organization isolation
- Role-based access control (RBAC)
- SSO integration (Okta, Azure AD)
- Audit logging

🔮 **Compliance Frameworks**
- SOC 2 controls mapping
- GDPR compliance checks
- HIPAA security assessment
- Custom framework support

🔮 **Advanced Analytics**
- Trend analysis
- Predictive risk scoring
- Benchmarking against peers
- Security posture over time

## Technical Deep Dive

### 1. Background Workers Architecture

**Purpose**: Continuously collect, analyze, and store security data

**Design**:
```
┌─────────────────────────────────────────────────┐
│           EventBridge Scheduler                  │
│   (Cron-based triggers every 15min/1hr/daily)   │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Step Functions      │
         │  (Orchestration)     │
         └──────────┬───────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │ Lambda │  │ Lambda │  │ Lambda │
   │ Worker │  │ Worker │  │ Worker │
   │ (GWS)  │  │ (CWS)  │  │ (AWS)  │
   └────┬───┘  └────┬───┘  └────┬───┘
        │           │           │
        └───────────┼───────────┘
                    │
                    ▼
          ┌──────────────────┐
          │   MCP Servers     │
          │  (Tool Providers) │
          └─────────┬─────────┘
                    │
                    ▼
          ┌──────────────────┐
          │   RDS PostgreSQL │
          │  (Knowledge Base) │
          └──────────────────┘
```

**Worker Types**:

1. **Discovery Workers**
   - Scan Google Workspace for users, groups, drives
   - Monitor Chrome Web Store for installed extensions
   - Detect new AWS resources (future)

2. **Analysis Workers**
   - Evaluate permissions and sharing
   - Check security configurations
   - Identify misconfigurations

3. **Learning Workers**
   - Update knowledge graphs
   - Detect anomalies and patterns
   - Build risk profiles

### 2. MCP Integration Strategy

**Why MCP?**
- Standardized protocol for Claude to access tools and data
- Modular architecture (each service = separate MCP server)
- Real-time data access for Claude during conversations

**MCP Servers to Build**:

```javascript
// Example MCP server for Google Workspace
{
  "name": "google-workspace-mcp",
  "tools": [
    {
      "name": "list_users",
      "description": "Get all users in Google Workspace",
      "inputSchema": { "type": "object", "properties": {} }
    },
    {
      "name": "check_user_permissions",
      "description": "Check permissions for a specific user",
      "inputSchema": {
        "type": "object",
        "properties": {
          "userId": { "type": "string" }
        }
      }
    },
    {
      "name": "analyze_sharing",
      "description": "Analyze file sharing patterns",
      "inputSchema": { "type": "object" }
    }
  ],
  "resources": [
    {
      "uri": "workspace://users",
      "name": "All Workspace Users",
      "mimeType": "application/json"
    }
  ]
}
```

**Deployment**:
- Run MCP servers as ECS Fargate containers
- Private endpoints within VPC
- Claude calls via Bedrock's tool use API

### 3. Dynamic UI Architecture

**Goal**: UI adapts to show exactly what the user needs

**Features**:

1. **Context-Aware Components**
   ```jsx
   // Example: Dynamic dashboard that responds to chat
   <Dashboard>
     {userAskedAboutUsers && <UsersWidget />}
     {userAskedAboutSharing && <SharingRisksChart />}
     {userAskedAboutExtensions && <ExtensionsTable />}
   </Dashboard>
   ```

2. **Real-time Updates**
   - WebSocket connection for live data
   - Server-sent events (SSE) for notifications
   - Optimistic UI updates

3. **Data Visualization Library**
   - D3.js for custom charts
   - Recharts for standard graphs
   - React Flow for relationship diagrams

4. **State Management**
   - Redux for global state
   - React Query for server state
   - Zustand for UI state

### 4. Database Schema Evolution

**Current Schema** (Phase 1):
```sql
-- Conversations and messages
conversations (id, created_at, updated_at, title, metadata)
messages (id, conversation_id, role, content, created_at, metadata)
```

**Enhanced Schema** (Phase 2+):
```sql
-- Organizations and users
organizations (id, name, domain, settings, created_at)
users (id, org_id, email, role, permissions, created_at)

-- Google Workspace data
gws_users (id, org_id, email, name, is_admin, last_login, suspended)
gws_groups (id, org_id, email, name, members_count)
gws_drives (id, org_id, name, owner, sharing_settings)
gws_files (id, drive_id, name, mime_type, shared_with, permissions)

-- Chrome Web Store data
cws_extensions (id, extension_id, name, version, permissions, risk_score)
cws_installations (id, org_id, extension_id, installed_by, installed_at)

-- Security findings
findings (id, org_id, type, severity, resource, description, discovered_at)
remediation_actions (id, finding_id, action_type, status, completed_at)

-- Knowledge base
security_rules (id, name, description, query, severity, active)
risk_patterns (id, pattern_type, indicators, confidence_score)

-- Audit logs
audit_events (id, org_id, user_id, action, resource, timestamp, details)
```

## Integration Specifications

### Google Workspace Integration

**APIs Used**:
- Admin SDK Directory API
- Drive API
- Gmail API
- Calendar API
- Reports API

**OAuth Scopes Required**:
```
https://www.googleapis.com/auth/admin.directory.user.readonly
https://www.googleapis.com/auth/admin.directory.group.readonly
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/admin.reports.audit.readonly
```

**Data Collection**:
1. **Users**: Email, name, admin status, 2FA enabled, last login
2. **Groups**: Name, members, external members
3. **Drives**: Shared drives, permissions, external sharing
4. **Files**: Public files, externally shared files
5. **Security**: Login events, admin actions, suspicious activities

**Security Checks**:
- ❌ Admin accounts without 2FA
- ❌ Externally shared sensitive files
- ❌ Inactive users with access
- ❌ Overprivileged service accounts
- ❌ Weak password policies

### Chrome Web Store Integration

**API**: Chrome Web Store API

**Data Collection**:
1. **Extensions**: ID, name, version, publisher
2. **Permissions**: Required permissions list
3. **Reviews**: User ratings, reported issues
4. **Updates**: Version history, changelog

**Risk Scoring**:
```javascript
function calculateExtensionRisk(extension) {
  let riskScore = 0;

  // High-risk permissions
  if (extension.permissions.includes('cookies')) riskScore += 30;
  if (extension.permissions.includes('webRequest')) riskScore += 25;
  if (extension.permissions.includes('<all_urls>')) riskScore += 40;

  // Publisher reputation
  if (extension.verifiedPublisher === false) riskScore += 20;

  // Update frequency
  const daysSinceUpdate = (Date.now() - extension.lastUpdate) / 86400000;
  if (daysSinceUpdate > 365) riskScore += 15;

  // User reports
  riskScore += extension.reportedIssues * 5;

  return Math.min(riskScore, 100);
}
```

**Security Checks**:
- ❌ Extensions with excessive permissions
- ❌ Unverified publishers
- ❌ Extensions not updated in 1+ year
- ❌ Extensions with reported security issues
- ❌ Shadow IT installations

## User Experience Flow

### 1. Onboarding

```
User signs up → Connect Google Workspace → Authorize scopes →
Initial scan starts → Dashboard shows progress →
First findings appear → Chat with Claude about findings →
Schedule regular scans → Get alerts
```

### 2. Daily Usage

**Dashboard View**:
```
┌─────────────────────────────────────────────────┐
│  Complens.ai - Security Dashboard               │
├─────────────────────────────────────────────────┤
│  🔴 Critical: 3  🟠 High: 12  🟡 Medium: 45     │
├─────────────────────────────────────────────────┤
│  Recent Findings                                │
│  • Admin without 2FA: john@company.com          │
│  • Public file with PII: Q4_Salaries.xlsx       │
│  • Risky extension installed: AutoFill Pro      │
├─────────────────────────────────────────────────┤
│  Chat with Claude                               │
│  💬 "Show me all admins without 2FA"            │
│  💬 "What files are publicly shared?"           │
│  💬 "Which extensions are most risky?"          │
└─────────────────────────────────────────────────┘
```

**Chat Interaction**:
```
User: "Show me all admins without 2FA"

Claude: I found 3 admin accounts without two-factor
authentication enabled:

1. john@company.com (Super Admin)
   Last login: 2 hours ago
   Risk: CRITICAL

2. sarah@company.com (User Admin)
   Last login: 3 days ago
   Risk: HIGH

3. it@company.com (Service Account)
   Last login: 14 days ago
   Risk: MEDIUM

[Enable 2FA Button] [Remind Me Later]

Would you like me to:
• Draft an email to these users
• Set up a 2FA enforcement policy
• Show other security recommendations
```

### 3. Dynamic UI Updates

**Before Question**:
```
Dashboard shows:
- Summary cards
- Recent activity
- Alert count
```

**After User Asks "Show me sharing risks"**:
```
Dashboard dynamically adds:
- Sharing risks chart
- Public files table
- External sharing timeline
- Recommended actions widget
```

## Competitive Advantages

### 1. AI-First Approach
- **Traditional tools**: Rule-based, static dashboards
- **Complens**: Claude understands context, explains issues, suggests fixes

### 2. Continuous Learning
- **Traditional tools**: Scan on-demand
- **Complens**: Background workers learn 24/7, detect emerging patterns

### 3. Conversational Interface
- **Traditional tools**: Complex UIs, steep learning curve
- **Complens**: Natural language queries, instant answers

### 4. Adaptive Presentation
- **Traditional tools**: Fixed dashboards
- **Complens**: UI adapts to show what you need, when you need it

### 5. Proactive Intelligence
- **Traditional tools**: Reactive alerts
- **Complens**: Predicts risks before they become issues

## Roadmap

### Months 1-2 ✅
- [x] Serverless infrastructure
- [x] Claude Sonnet 4 integration
- [x] Basic chat interface
- [x] PostgreSQL database
- [x] CI/CD pipeline
- [x] Cost optimization

### Months 3-4 🚧
- [ ] Google Workspace OAuth integration
- [ ] Background worker framework (Step Functions + Lambda)
- [ ] MCP server architecture
- [ ] GWS data collection workers
- [ ] Basic security rules engine
- [ ] Finding detection and storage

### Months 5-6 🔮
- [ ] Chrome Web Store integration
- [ ] Extension risk scoring
- [ ] Dynamic dashboard components
- [ ] WebSocket real-time updates
- [ ] Advanced MCP tools
- [ ] Remediation workflows

### Months 7-9 🔮
- [ ] Multi-tenant architecture
- [ ] SSO integration
- [ ] RBAC implementation
- [ ] Compliance frameworks
- [ ] Benchmarking engine
- [ ] Custom reporting

### Months 10-12 🔮
- [ ] AWS security integration
- [ ] Azure AD integration
- [ ] Slack/Teams notifications
- [ ] API for integrations
- [ ] White-label options
- [ ] Enterprise features

## Success Metrics

### Technical Metrics
- **Response time**: < 200ms for API calls
- **Scan frequency**: Every 15 minutes for critical resources
- **Data freshness**: < 1 hour for all resources
- **Uptime**: 99.9% availability
- **Cost per scan**: < $0.01 per organization per day

### Product Metrics
- **Time to first finding**: < 5 minutes after connection
- **False positive rate**: < 5%
- **Findings remediated**: > 60% within 7 days
- **User engagement**: 3+ sessions per week
- **Query success rate**: > 90% of questions answered

### Business Metrics
- **Trial to paid conversion**: > 20%
- **Customer retention**: > 85% annual
- **NPS score**: > 50
- **Revenue per customer**: $500-5000/month based on org size

## Pricing Strategy (Future)

### Free Tier
- Up to 50 users
- Google Workspace only
- Daily scans
- Basic findings
- 30-day history

### Pro Tier - $99/month
- Up to 500 users
- Google Workspace + Chrome Web Store
- Hourly scans
- Advanced findings
- 90-day history
- Email alerts
- API access

### Enterprise Tier - $499/month
- Unlimited users
- All integrations
- 15-minute scans
- Custom rules
- Unlimited history
- SSO, RBAC
- Dedicated support
- White-label option

## Technology Stack Summary

**Current (Phase 1)**:
- Frontend: React 18, Axios
- Backend: Node.js 20, Lambda
- Database: PostgreSQL 15
- AI: Claude Sonnet 4 (Bedrock)
- Infrastructure: CloudFormation, VPC
- CI/CD: GitHub Actions

**Future Additions**:
- **Orchestration**: AWS Step Functions
- **Scheduling**: EventBridge
- **Containers**: ECS Fargate (for MCP servers)
- **Real-time**: WebSocket API Gateway
- **Caching**: ElastiCache Redis
- **Search**: OpenSearch (for findings search)
- **Notifications**: SNS, SES
- **Monitoring**: CloudWatch, X-Ray
- **State**: Redux, React Query
- **Visualization**: D3.js, Recharts

## Next Immediate Steps

1. **Enable NAT Gateway when needed**:
   - Uncomment NAT resources in CloudFormation
   - Add when starting Google Workspace integration
   - Cost: +$32/month, necessary for external API calls

2. **Set up Google Cloud Project**:
   - Create OAuth credentials
   - Configure consent screen
   - Add authorized redirect URIs

3. **Build first MCP server**:
   - Google Workspace user enumeration
   - Deploy as Fargate container
   - Test with Claude tool calling

4. **Create background worker**:
   - Step Functions workflow
   - Lambda for data collection
   - Store in PostgreSQL

5. **Expand database schema**:
   - Add GWS tables
   - Create indexes
   - Set up migrations

---

**Vision Owner**: Complens.ai Team
**Last Updated**: 2025-11-27
**Status**: Phase 1 Complete, Phase 2 In Planning
