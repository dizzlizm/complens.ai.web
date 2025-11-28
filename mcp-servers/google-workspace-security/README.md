# Google Workspace Security MCP Server

A Model Context Protocol (MCP) server that provides security analysis tools for Google Workspace environments.

## Features

### Security Tools

1. **`list_users_without_2fa`**
   - Lists all users without two-factor authentication
   - Identifies high-risk accounts (admins without 2FA)
   - Stores findings in the database

2. **`find_admin_accounts`**
   - Enumerates all admin accounts
   - Reports 2FA status for each admin
   - Identifies super admins vs delegated admins

3. **`analyze_external_sharing`**
   - Finds files shared with external users
   - Detects publicly accessible files
   - Tracks sharing permissions

4. **`check_security_policies`**
   - Evaluates workspace security settings
   - Checks password policies
   - Reviews session management

### Resources

- **`workspace://security-summary`** - Aggregated security findings

## Setup

### 1. Create Google Cloud Service Account

```bash
# In Google Cloud Console:
# 1. Create a new service account
# 2. Grant domain-wide delegation
# 3. Add required OAuth scopes:
#    - https://www.googleapis.com/auth/admin.directory.user.readonly
#    - https://www.googleapis.com/auth/admin.directory.group.readonly
#    - https://www.googleapis.com/auth/drive.readonly
# 4. Download JSON key file
```

### 2. Configure Google Workspace Admin Console

```bash
# In Google Workspace Admin Console:
# 1. Security > API Controls > Domain-wide Delegation
# 2. Add your service account's Client ID
# 3. Authorize the OAuth scopes listed above
```

### 3. Set Environment Variables

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Locally

```bash
npm start
```

## Docker Deployment

### Build Image

```bash
docker build -t complens-mcp-gws-security .
```

### Run Container

```bash
docker run -it --rm \
  --env-file .env \
  complens-mcp-gws-security
```

## AWS ECS Deployment

### 1. Push to ECR

```bash
# Get ECR repository URI from CloudFormation outputs
export ECR_REPO=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`MCPRepositoryUri`].OutputValue' \
  --output text)

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO

# Tag and push
docker tag complens-mcp-gws-security:latest $ECR_REPO:gws-security-latest
docker push $ECR_REPO:gws-security-latest
```

### 2. Create ECS Task Definition

Create `task-definition.json`:

```json
{
  "family": "dev-complens-mcp-gws-security",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/dev-complens-mcp-execution-role",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/dev-complens-mcp-task-role",
  "containerDefinitions": [
    {
      "name": "gws-security",
      "image": "ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/dev-complens-mcp-servers:gws-security-latest",
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/dev/complens-mcp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "gws-security"
        }
      },
      "secrets": [
        {
          "name": "DB_HOST",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:dev/complens/app-secrets:dbHost::"
        },
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:dev/complens/app-secrets:dbPassword::"
        }
      ],
      "environment": [
        {"name": "DB_PORT", "value": "5432"},
        {"name": "DB_NAME", "value": "complens"},
        {"name": "DB_USER", "value": "complensadmin"}
      ]
    }
  ]
}
```

### 3. Register Task Definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://task-definition.json
```

### 4. Run Task

```bash
aws ecs run-task \
  --cluster dev-complens-mcp-cluster \
  --task-definition dev-complens-mcp-gws-security \
  --launch-type FARGATE \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["subnet-xxx", "subnet-yyy"],
      "securityGroups": ["sg-xxx"],
      "assignPublicIp": "DISABLED"
    }
  }'
```

## Usage with Claude

When Claude has access to this MCP server, it can call these tools:

```
User: "Show me all users without 2FA"
Claude: [calls list_users_without_2fa tool]

User: "Find all admin accounts"
Claude: [calls find_admin_accounts tool]

User: "What files are shared externally?"
Claude: [calls analyze_external_sharing tool]
```

## Database Schema

This MCP server expects these tables:

```sql
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
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
```

## Security Considerations

1. **Service Account Key** - Store in AWS Secrets Manager, not in environment variables
2. **Database Credentials** - Use AWS Secrets Manager
3. **Network** - Run in private subnets, use NAT Gateway for Google API access
4. **IAM Permissions** - Use least-privilege IAM roles
5. **Logging** - All operations are logged to CloudWatch

## Troubleshooting

### "Insufficient permissions" error

- Verify service account has domain-wide delegation
- Check OAuth scopes in Admin Console
- Ensure service account email is authorized

### Database connection failures

- Verify RDS security group allows MCP security group
- Check database credentials in Secrets Manager
- Ensure ECS task is in the correct VPC subnets

### Google API rate limits

- Implement exponential backoff
- Consider caching results
- Spread scans across time

## Next Steps

- Add more security checks (OAuth apps, Chrome extensions)
- Implement automated remediation
- Add Slack/email notifications
- Create scheduled scans with EventBridge
