# Complens.ai Architecture

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                            INTERNET                                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ HTTPS
                         ▼
        ┌────────────────────────────────┐
        │   CloudFront Distribution      │
        │   (CDN + SSL/TLS)             │
        └────────────┬───────────────────┘
                     │
                     ├──────────────┬──────────────────┐
                     │              │                  │
                     ▼              ▼                  ▼
         ┌─────────────────┐  ┌──────────┐  ┌──────────────────┐
         │   S3 Bucket      │  │   API    │  │  Static Assets   │
         │   (Frontend)     │  │ Gateway  │  │     (imgs, etc)  │
         └─────────────────┘  └────┬─────┘  └──────────────────┘
                                   │
                                   │ HTTP/REST
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              AWS VPC                                  │
│  CIDR: 10.0.0.0/16                                                   │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    PUBLIC SUBNETS (2 AZs)                    │   │
│  │  - 10.0.1.0/24 (AZ-1)                                        │   │
│  │  - 10.0.2.0/24 (AZ-2)                                        │   │
│  │                                                               │   │
│  │  ┌────────────────┐         ┌──────────────────┐            │   │
│  │  │  NAT Gateway   │         │  Internet        │            │   │
│  │  │  (AZ-1)        │◄────────│  Gateway         │            │   │
│  │  └────────────────┘         └──────────────────┘            │   │
│  └─────────────────┬───────────────────────────────────────────┘   │
│                    │                                                │
│                    │ Routes to Internet                             │
│                    ▼                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   PRIVATE SUBNETS (2 AZs)                    │   │
│  │  - 10.0.11.0/24 (AZ-1)                                       │   │
│  │  - 10.0.12.0/24 (AZ-2)                                       │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────┐        │   │
│  │  │         Lambda Functions (Node.js 20.x)          │        │   │
│  │  │  ┌──────────────────────────────────────────┐    │        │   │
│  │  │  │  API Handler (index.js)                  │    │        │   │
│  │  │  │  - Route requests                        │    │        │   │
│  │  │  │  - CORS handling                         │    │        │   │
│  │  │  │  - Error handling                        │    │        │   │
│  │  │  └──────────────────────────────────────────┘    │        │   │
│  │  │  ┌──────────────────────────────────────────┐    │        │   │
│  │  │  │  Services Layer                          │    │        │   │
│  │  │  │  ┌────────────────────────────────────┐  │    │        │   │
│  │  │  │  │ Bedrock Service                    │  │    │        │   │
│  │  │  │  │ - Dual-model architecture          │  │    │        │   │
│  │  │  │  │ - Dynamic format conversion        │  │    │        │   │
│  │  │  │  │ - Token usage tracking             │  │    │        │   │
│  │  │  │  └────────────────────────────────────┘  │    │        │   │
│  │  │  │  ┌────────────────────────────────────┐  │    │        │   │
│  │  │  │  │ Database Service                   │  │    │        │   │
│  │  │  │  │ - PostgreSQL connection pool       │  │    │        │   │
│  │  │  │  │ - Schema management                │  │    │        │   │
│  │  │  │  │ - Query execution                  │  │    │        │   │
│  │  │  │  └────────────────────────────────────┘  │    │        │   │
│  │  │  │  ┌────────────────────────────────────┐  │    │        │   │
│  │  │  │  │ Secrets Service                    │  │    │        │   │
│  │  │  │  │ - Credential retrieval             │  │    │        │   │
│  │  │  │  │ - Secrets caching                  │  │    │        │   │
│  │  │  │  └────────────────────────────────────┘  │    │        │   │
│  │  │  └──────────────────────────────────────────┘    │        │   │
│  │  └──────────────────────────────────────────────────┘        │   │
│  │         │              │                │                     │   │
│  │         │              │                │                     │   │
│  │         ▼              ▼                ▼                     │   │
│  │  ┌───────────┐  ┌───────────┐  ┌──────────────────┐         │   │
│  │  │ RDS       │  │ Bedrock   │  │ Secrets Manager  │         │   │
│  │  │ PostgreSQL│  │ Runtime   │  │                  │         │   │
│  │  │           │  │ (VPC      │  │ (VPC Endpoint)   │         │   │
│  │  │ - Encrypted│ │ Endpoint) │  │                  │         │   │
│  │  │ - Multi-AZ│  │           │  │ - DB Credentials │         │   │
│  │  │   (prod)  │  │ - Nova &  │  │ - API Keys       │         │   │
│  │  │ - Auto    │  │   Claude  │  │                  │         │   │
│  │  │   Backup  │  │   Models  │  │                  │         │   │
│  │  └───────────┘  └───────────┘  └──────────────────┘         │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend (React SPA)

**Technology**: React 18, Axios

**Hosting**:
- S3 bucket (static hosting disabled for security)
- CloudFront distribution (HTTPS only)
- Origin Access Identity for S3 access

**Components**:
- `App.js` - Main application container
- `ChatMessage.js` - Individual message display
- `api.js` - API client with interceptors

**Features**:
- Real-time chat interface
- Conversation history
- Token usage display
- Error handling
- Responsive design

### API Layer (API Gateway)

**Type**: HTTP API (cheaper than REST API)

**Features**:
- CORS configuration
- CloudWatch logging
- Request/response transformation
- Rate limiting (configurable)

**Endpoints**:
```
GET  /health              - Health check
POST /chat                - Send message to Claude
GET  /conversations       - List conversations
GET  /conversations/:id   - Get conversation details
```

### Backend (Lambda)

**Runtime**: Node.js 20.x

**Configuration**:
- Memory: 256MB (dev), 512MB (prod)
- Timeout: 30 seconds
- VPC: Enabled (private subnets)
- Reserved Concurrency: Not set (uses account default)

**Dependencies**:
- `@aws-sdk/client-bedrock-runtime` - Bedrock integration
- `@aws-sdk/client-secrets-manager` - Secrets retrieval
- `pg` - PostgreSQL client

**Environment Variables**:
- `SECRETS_ARN` - Secrets Manager ARN
- `REGION` - AWS region

### Database (RDS PostgreSQL)

**Engine**: PostgreSQL 15.5

**Instance Types**:
- Dev: `db.t4g.micro` (2 vCPU, 1GB RAM)
- Prod: `db.t4g.medium` (2 vCPU, 4GB RAM)

**Storage**:
- Type: GP3 (General Purpose SSD)
- Size: 20GB (dev), 100GB (prod)
- Encrypted: Yes

**Configuration**:
- Multi-AZ: No (dev), Yes (prod)
- Backup retention: 1 day (dev), 7 days (prod)
- Automated backups: Enabled
- Public access: No
- VPC: Private subnets only

**Schema**:
```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  title TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

### AI Models (Bedrock)

**Dual-Model Architecture**:
1. **Chat Model** (default: Amazon Nova Lite)
   - Model ID: `us.amazon.nova-lite-v1:0`
   - Cost: ~$0.06 input / $0.24 output per 1M tokens
   - Use case: General conversations

2. **Security Model** (default: Claude 3.5 Sonnet v2)
   - Model ID: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`
   - Cost: ~$3 input / $15 output per 1M tokens
   - Use case: Security analysis, threat detection

**Configuration**:
- Max tokens: 4096 (configurable)
- Temperature: 0.7 (default), 0.3 (analysis)
- Configurable via environment variables

**Integration**:
- VPC Endpoint for private access
- IAM role-based authentication
- Dynamic model selection based on task
- Request/response streaming support (planned)

### Networking

**VPC Configuration**:
- CIDR: 10.0.0.0/16
- Subnets:
  - Public: 10.0.1.0/24, 10.0.2.0/24
  - Private: 10.0.11.0/24, 10.0.12.0/24
- Availability Zones: 2
- NAT Gateway: 1 (in AZ-1)
- Internet Gateway: 1

**VPC Endpoints** (cost optimization):
- S3 (Gateway endpoint)
- Secrets Manager (Interface endpoint)
- Bedrock Runtime (Interface endpoint)

**Security Groups**:
```
Lambda SG:
  Outbound: All traffic (for NAT)
  Inbound: None

RDS SG:
  Outbound: None
  Inbound: PostgreSQL (5432) from Lambda SG only

VPC Endpoint SG:
  Outbound: None
  Inbound: HTTPS (443) from Lambda SG only
```

### Security (Secrets Manager)

**Secret Structure**:
```json
{
  "dbUsername": "complensadmin",
  "dbPassword": "***",
  "dbHost": "dev-complens-postgres.xxx.us-east-1.rds.amazonaws.com",
  "dbPort": "5432",
  "dbName": "complens"
}
```

**Access**:
- Lambda execution role has `secretsmanager:GetSecretValue`
- VPC endpoint for private access
- Automatic rotation (planned)

### IAM Roles

**Lambda Execution Role**:
```json
{
  "Policies": [
    "AWSLambdaVPCAccessExecutionRole",
    "CloudWatchLambdaInsightsExecutionRolePolicy"
  ],
  "CustomPolicies": {
    "BedrockAccess": {
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    },
    "SecretsManagerAccess": {
      "secretsmanager:GetSecretValue"
    },
    "S3Access": {
      "s3:GetObject",
      "s3:PutObject"
    }
  }
}
```

## Data Flow

### User Message Flow

```
1. User types message in React UI
   ↓
2. Frontend sends POST to /chat via API Gateway
   ↓
3. API Gateway invokes Lambda
   ↓
4. Lambda retrieves DB credentials from Secrets Manager
   ↓
5. Lambda fetches conversation history from RDS
   ↓
6. Lambda sends message + history to Bedrock
   ↓
7. Bedrock (Nova or Claude) generates response
   ↓
8. Lambda saves conversation turn to RDS
   ↓
9. Lambda returns response to API Gateway
   ↓
10. API Gateway returns to Frontend
    ↓
11. Frontend displays AI response
```

### Database Query Flow

```
1. Lambda initializes connection pool (on cold start)
   ↓
2. Retrieves credentials from Secrets Manager
   ↓
3. Connects to RDS via private subnet
   ↓
4. Executes query (parameterized to prevent SQL injection)
   ↓
5. Returns result to Lambda handler
   ↓
6. Connection returned to pool (reused)
```

## Scalability

### Current Limits

- **Lambda**: 1000 concurrent executions (default account limit)
- **API Gateway**: 10,000 requests/second (default)
- **RDS**: Based on instance size
  - db.t4g.micro: ~100 connections
  - db.t4g.medium: ~200 connections
- **Bedrock**: Rate limits vary by model and region

### Scaling Strategies

1. **Lambda**:
   - Auto-scales to 1000 concurrent (increase via quota request)
   - Use provisioned concurrency for critical paths
   - Implement connection pooling for database

2. **RDS**:
   - Vertical scaling: Upgrade instance class
   - Add RDS Proxy for connection pooling
   - Read replicas for read-heavy workloads
   - Consider Aurora Serverless v2 for auto-scaling

3. **API Gateway**:
   - Throttling limits configurable
   - Use caching for repeated requests
   - Implement request quotas per user

4. **Bedrock**:
   - Request quota increases if needed
   - Implement request queuing for burst traffic
   - Use streaming for large responses

## Cost Optimization

### Current Monthly Costs (Dev Environment)

| Service | Cost |
|---------|------|
| RDS (db.t4g.micro) | ~$15 |
| NAT Gateway | ~$32 |
| CloudFront | Free tier |
| S3 | <$1 |
| Lambda | Free tier |
| API Gateway | Free tier |
| VPC Endpoints | ~$7/endpoint = ~$21 |
| **Total (excluding Bedrock)** | **~$70/month** |

### Optimization Strategies

1. **Remove NAT Gateway** (saves ~$32/month):
   - Use VPC endpoints exclusively
   - Lambda only accesses AWS services (no external APIs)

2. **Use Aurora Serverless v2** (production):
   - Scales to zero when idle
   - Pay per second of use

3. **CloudFront caching**:
   - Cache static assets (already configured)
   - Reduces S3 requests

4. **Lambda optimization**:
   - Right-size memory allocation
   - Use ARM64 architecture (Graviton2)
   - Minimize cold starts

5. **Bedrock usage**:
   - Use shorter context windows
   - Implement conversation limits
   - Cache common responses

## Monitoring & Observability

### CloudWatch Metrics

**Lambda**:
- Invocations
- Duration
- Errors
- Throttles
- Concurrent executions

**RDS**:
- CPU utilization
- Database connections
- Read/write IOPS
- Storage usage

**API Gateway**:
- Request count
- Latency
- 4xx/5xx errors

**Bedrock**:
- Model invocations
- Input/output token usage
- Latency

### Logging

**Lambda logs**: `/aws/lambda/dev-complens-api`
**API Gateway logs**: `/aws/apigateway/dev-complens-api`
**RDS logs**: Exported to CloudWatch

### Alarms (Recommended)

```bash
# Lambda errors
aws cloudwatch put-metric-alarm \
  --alarm-name high-lambda-errors \
  --metric-name Errors \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold

# RDS CPU
aws cloudwatch put-metric-alarm \
  --alarm-name high-rds-cpu \
  --metric-name CPUUtilization \
  --threshold 80

# API Gateway 5xx errors
aws cloudwatch put-metric-alarm \
  --alarm-name high-api-errors \
  --metric-name 5XXError \
  --threshold 10
```

## Security Best Practices

### Implemented ✅

- VPC with private subnets
- Security groups with least privilege
- RDS encryption at rest
- Secrets Manager for credentials
- IAM roles with minimal permissions
- CloudFront HTTPS only
- S3 bucket encryption
- VPC endpoints for service access

### Recommended for Production 🔒

- Enable WAF on CloudFront
- Add user authentication (Cognito)
- Implement rate limiting
- Enable AWS Shield (DDoS protection)
- Use AWS Config for compliance
- Enable GuardDuty for threat detection
- Implement request signing
- Add API key authentication
- Enable RDS Multi-AZ
- Configure RDS encryption in transit
- Use AWS Systems Manager Session Manager
- Enable CloudTrail for audit logs

## Disaster Recovery

### Backup Strategy

**RDS**:
- Automated daily backups
- Retention: 7 days (prod)
- Manual snapshots before changes

**S3**:
- Versioning enabled
- Lifecycle policies for old versions

**Lambda**:
- Code stored in S3 (versioned)
- Infrastructure as Code (CloudFormation)

### Recovery Procedures

**RDS Restore**:
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier complens-prod-restore \
  --db-snapshot-identifier snapshot-id
```

**Lambda Rollback**:
```bash
aws lambda update-function-code \
  --function-name prod-complens-api \
  --s3-bucket bucket-name \
  --s3-key api/previous-version.zip
```

**Full Stack Rebuild**:
```bash
cd infrastructure/cloudformation
./deploy.sh prod
```

## Future Enhancements

### Planned Features

1. **Streaming responses** from Bedrock
2. **WebSocket API** for real-time updates
3. **User authentication** with Cognito
4. **Conversation search** with OpenSearch
5. **File uploads** to S3 with virus scanning
6. **Rate limiting** per user
7. **Usage dashboard** for analytics
8. **Multi-region deployment** for HA
9. **CI/CD pipeline** with GitHub Actions
10. **Automated testing** suite

### Architecture Evolution

```
Phase 1 (Current): Basic serverless chat
Phase 2: Add authentication, rate limiting
Phase 3: Implement streaming, WebSockets
Phase 4: Multi-region, advanced features
Phase 5: Enterprise features, analytics
```

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
