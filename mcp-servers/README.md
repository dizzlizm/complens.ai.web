# Complens.ai MCP Servers

Model Context Protocol (MCP) servers for Complens.ai security analysis platform. These servers provide tools and resources that Claude can use to perform security analysis on various platforms.

## Overview

MCP servers are the backbone of Complens.ai's security analysis capabilities. They:

1. **Collect data** from external APIs (Google Workspace, Chrome Web Store, AWS, etc.)
2. **Analyze security posture** using predefined security rules
3. **Store findings** in the PostgreSQL database
4. **Provide tools** to Claude for interactive security queries
5. **Expose resources** that Claude can access for contextual information

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude (Bedrock)                     │
│                                                          │
│  "Show me all users without 2FA"                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ MCP Protocol
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│  MCP Server 1   │    │  MCP Server 2   │
│  (GWS Security) │    │ (Chrome Store)  │
└────────┬────────┘    └────────┬────────┘
         │                      │
         │                      │
         ▼                      ▼
    ┌─────────────────────────────┐
    │     External APIs           │
    │  - Google Workspace         │
    │  - Chrome Web Store         │
    │  - AWS APIs                 │
    └─────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │   PostgreSQL   │
            │   (Findings)   │
            └────────────────┘
```

## Available MCP Servers

### 1. Google Workspace Security

**Path**: `./google-workspace-security`

**Purpose**: Analyze Google Workspace for security misconfigurations

**Tools**:
- `list_users_without_2fa` - Find users without 2FA
- `find_admin_accounts` - List all admin accounts
- `analyze_external_sharing` - Detect externally shared files
- `check_security_policies` - Review security settings

**Resources**:
- `workspace://security-summary` - Security findings summary

[Full Documentation](./google-workspace-security/README.md)

### 2. Chrome Web Store Security (Coming Soon)

**Purpose**: Analyze Chrome extensions for security risks

**Tools** (planned):
- `list_installed_extensions` - Enumerate installed extensions
- `analyze_extension_permissions` - Check dangerous permissions
- `check_extension_updates` - Find outdated extensions
- `scan_for_malware` - Detect known malicious extensions

### 3. AWS Security (Coming Soon)

**Purpose**: Analyze AWS infrastructure for security issues

**Tools** (planned):
- `list_s3_public_buckets` - Find publicly accessible S3 buckets
- `check_iam_policies` - Review overly permissive IAM policies
- `analyze_security_groups` - Find overly permissive security groups
- `check_encryption` - Verify encryption at rest/transit

## Deployment

### Prerequisites

1. **AWS Infrastructure** - Deploy CloudFormation stack:
   ```bash
   cd infrastructure/cloudformation
   ./deploy.sh dev
   ```

2. **Database Schema** - Run migrations:
   ```bash
   cd backend/database
   psql $DB_URL -f migrations/001_create_findings_table.sql
   ```

3. **ECR Repository** - Get repository URI:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name complens-dev \
     --query 'Stacks[0].Outputs[?OutputKey==`MCPRepositoryUri`].OutputValue' \
     --output text
   ```

### Build and Deploy MCP Server

Each MCP server can be deployed independently:

```bash
# Navigate to MCP server directory
cd mcp-servers/google-workspace-security

# Build Docker image
docker build -t complens-mcp-gws .

# Tag for ECR
docker tag complens-mcp-gws:latest $ECR_REPO:gws-latest

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO

# Push to ECR
docker push $ECR_REPO:gws-latest

# Deploy to ECS Fargate
aws ecs run-task \
  --cluster dev-complens-mcp-cluster \
  --task-definition dev-complens-mcp-gws \
  --launch-type FARGATE \
  --network-configuration file://network-config.json
```

### Scheduled Execution with EventBridge

For background workers that run on a schedule:

```bash
# Create EventBridge rule
aws events put-rule \
  --name dev-complens-gws-scan \
  --schedule-expression "rate(1 hour)" \
  --state ENABLED

# Add ECS task as target
aws events put-targets \
  --rule dev-complens-gws-scan \
  --targets file://eventbridge-target.json
```

## Database Schema

MCP servers write findings to a shared PostgreSQL database.

### Required Tables

```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Security Findings
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resource TEXT NOT NULL,
  description TEXT NOT NULL,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP
);

CREATE INDEX idx_findings_org_id ON findings(org_id);
CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_discovered_at ON findings(discovered_at);
CREATE INDEX idx_findings_type ON findings(type);

-- Google Workspace Data
CREATE TABLE gws_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  has_2fa BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  suspended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, email)
);

CREATE TABLE gws_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  owner_email TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  sharing_settings JSONB DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, file_id)
);
```

## Development

### Local Development

```bash
# Install dependencies
cd mcp-servers/google-workspace-security
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run in development mode
npm run dev
```

### Testing with Claude Desktop

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-workspace-security": {
      "command": "node",
      "args": ["/path/to/complens.ai/mcp-servers/google-workspace-security/index.js"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_NAME": "complens_dev",
        "DB_USER": "postgres",
        "DB_PASSWORD": "password",
        "ORG_ID": "test-org-uuid",
        "GOOGLE_SERVICE_ACCOUNT_KEY": "{...}"
      }
    }
  }
}
```

### Creating a New MCP Server

1. Create directory: `mcp-servers/my-new-server/`
2. Copy template from `google-workspace-security/`
3. Update `package.json` with server name
4. Implement tools in `index.js`
5. Create `Dockerfile`
6. Add README with documentation
7. Test locally
8. Deploy to ECR/ECS

## Security Best Practices

1. **Never commit secrets** - Use AWS Secrets Manager
2. **Use VPC endpoints** - Avoid public internet where possible
3. **Least privilege IAM** - Grant only required permissions
4. **Encrypt at rest** - Use encryption for all data
5. **Audit logging** - Log all operations to CloudWatch
6. **Network isolation** - Run in private subnets
7. **Image scanning** - Enable ECR image scanning
8. **Regular updates** - Keep dependencies updated

## Monitoring

### CloudWatch Logs

Each MCP server logs to:
```
/ecs/dev/complens-mcp/<server-name>
```

### CloudWatch Metrics

Monitor:
- Task count
- CPU/Memory utilization
- Error rates
- API call latencies

### Alarms

Set up alarms for:
- Task failures
- High error rates
- Resource exhaustion

## Cost Optimization

### ECS Fargate Pricing

- **vCPU**: $0.04048 per vCPU per hour
- **Memory**: $0.004445 per GB per hour

Example task (0.25 vCPU, 0.5 GB):
- Cost per hour: ~$0.012
- Cost per day (running 24/7): ~$0.29
- Monthly cost: ~$8.70

### Scheduled vs Always-On

**Scheduled** (recommended for periodic scans):
- Run hourly for 5 minutes
- Monthly cost: ~$0.36

**Always-On** (for real-time analysis):
- Run 24/7
- Monthly cost: ~$8.70

### NAT Gateway

- **Cost**: $0.045 per hour = ~$32/month
- **Data transfer**: $0.045 per GB
- Required for external API calls

## Troubleshooting

### Task fails to start

1. Check CloudWatch logs: `/ecs/dev/complens-mcp/<server>`
2. Verify IAM roles have correct permissions
3. Check security group allows outbound traffic
4. Verify VPC subnets have NAT Gateway route

### Database connection fails

1. Verify RDS security group allows MCP security group
2. Check Secrets Manager credentials
3. Ensure ECS tasks in correct subnets
4. Test database connectivity from within VPC

### API authentication fails

1. Verify service account credentials
2. Check OAuth scopes
3. Ensure domain-wide delegation is enabled
4. Review API quotas and rate limits

## Contributing

When adding a new MCP server:

1. Follow the existing structure
2. Document all tools and resources
3. Include comprehensive README
4. Add error handling
5. Implement logging
6. Write tests
7. Update this main README

## License

Proprietary - Complens.ai

---

**For questions**: Contact the Complens.ai team
