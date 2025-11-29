# Complens.ai

A serverless AI security platform built on AWS using Amazon Bedrock, React frontend, Lambda functions, PostgreSQL, and full VPC infrastructure.

## 🏗️ Architecture Overview

This application follows a modern serverless architecture with the following components:

### Infrastructure
- **Frontend**: React SPA hosted on S3, delivered via CloudFront
- **Backend**: AWS Lambda functions (Node.js)
- **Database**: Amazon RDS PostgreSQL (encrypted, private subnets)
- **AI Models**: Amazon Bedrock with configurable models (Nova for chat, Claude for security)
- **API**: API Gateway HTTP API with CORS support
- **Networking**: VPC with public/private subnets, NAT Gateway, VPC Endpoints
- **Security**: AWS Secrets Manager for credentials, IAM roles with least privilege

### Cost Optimization Features
- **Bedrock**: Pay-per-token pricing (no GPU infrastructure to manage)
- **RDS**: T4g micro instances for dev (scalable to larger for prod)
- **VPC Endpoints**: Reduce NAT Gateway costs for AWS service traffic
- **CloudFront**: CDN caching reduces S3 costs
- **Lambda**: Pay only for execution time

## 📁 Project Structure

```
complens.ai/
├── infrastructure/
│   └── cloudformation/
│       ├── main.yaml              # Main CloudFormation template
│       ├── deploy.sh              # Deployment script
│       └── parameters/
│           ├── dev.json           # Dev environment parameters
│           └── prod.json          # Prod environment parameters
├── backend/
│   └── lambda/
│       └── api/
│           ├── index.js           # Main Lambda handler
│           ├── package.json       # Dependencies
│           ├── services/
│           │   ├── bedrock.js     # Bedrock/Claude integration
│           │   ├── database.js    # PostgreSQL client
│           │   └── secrets.js     # Secrets Manager client
│           └── .gitignore
├── frontend/
│   ├── package.json
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js                 # Main React component
│   │   ├── App.css
│   │   ├── index.js
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── ChatMessage.js     # Message display component
│   │   │   └── ChatMessage.css
│   │   └── services/
│   │       └── api.js             # API client
│   ├── .env.example
│   └── .gitignore
├── docs/
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured (`aws configure`)
- Node.js 18+ and npm
- Domain name (optional): `complens.ai` for dev, `app.complens.ai` for prod

### Step 1: Deploy Infrastructure

1. **Update CloudFormation parameters**:

   Edit `infrastructure/cloudformation/parameters/dev.json` and set a secure database password:

   ```json
   {
     "ParameterKey": "DBMasterPassword",
     "ParameterValue": "YourSecurePassword123!"
   }
   ```

2. **Deploy the CloudFormation stack**:

   ```bash
   cd infrastructure/cloudformation
   ./deploy.sh dev
   ```

   This will create:
   - VPC with public/private subnets
   - RDS PostgreSQL database
   - S3 buckets for frontend and Lambda code
   - CloudFront distribution
   - API Gateway
   - IAM roles and security groups
   - VPC endpoints for cost optimization

3. **Note the outputs**:

   After deployment, save these outputs for later:
   - `CloudFrontURL` - Your frontend URL
   - `ApiGatewayURL` - Your API endpoint
   - `FrontendBucketName` - S3 bucket for frontend
   - `LambdaCodeBucketName` - S3 bucket for Lambda code

### Step 2: Deploy Lambda Functions

1. **Install dependencies**:

   ```bash
   cd backend/lambda/api
   npm install
   ```

2. **Build and deploy**:

   ```bash
   # Build Lambda package
   npm run build

   # Upload to S3
   export LAMBDA_BUCKET=<your-lambda-bucket-name>
   npm run deploy
   ```

3. **Update CloudFormation to enable Lambda**:

   Uncomment the `ApiLambdaFunction` resource in `infrastructure/cloudformation/main.yaml` and redeploy:

   ```bash
   cd infrastructure/cloudformation
   ./deploy.sh dev
   ```

### Step 3: Deploy Frontend

1. **Configure environment**:

   ```bash
   cd frontend
   cp .env.example .env
   ```

   Update `.env` with your API Gateway URL from CloudFormation outputs:

   ```
   REACT_APP_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build and deploy**:

   ```bash
   # Build production bundle
   npm run build

   # Deploy to S3
   export FRONTEND_BUCKET=<your-frontend-bucket-name>
   export CLOUDFRONT_ID=<your-cloudfront-id>
   npm run deploy
   ```

4. **Access your app**:

   Visit the CloudFront URL from the CloudFormation outputs.

## 🔧 Configuration

### Environment Variables

**Frontend** (`.env`):
```
REACT_APP_API_URL=https://your-api.execute-api.us-east-1.amazonaws.com/dev
```

**Backend** (set by CloudFormation):
- `SECRETS_ARN` - Secrets Manager ARN
- `REGION` - AWS region

### Bedrock Model Configuration

Complens.ai uses a **dual-model architecture** for optimal cost and performance:
- **Chat Model**: Amazon Nova Lite (default) - 98% cheaper than Claude
- **Security Analysis**: Claude 3.5 Sonnet v2 - Strong reasoning for security tasks

To change models, set GitHub secrets or edit CloudFormation parameters:
- `BEDROCK_MODEL_ID` - Chat model (default: `us.amazon.nova-lite-v1:0`)
- `BEDROCK_SECURITY_MODEL_ID` - Security model (default: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`)

See `docs/BEDROCK_MODELS.md` for complete model configuration guide.

### Database Schema

The database schema is automatically created on first Lambda execution:

- **conversations** table: Stores conversation metadata
- **messages** table: Stores individual messages (user/assistant)
- **security_intel** table: Caches external security data (NIST, CVE, etc.) with 24-hour TTL

## 💰 Cost Estimates

### Development Environment (dev) - **OPTIMIZED**

✅ **Current Configuration** (NAT Gateway removed):
- **RDS PostgreSQL (db.t4g.micro)**: ~$15/month
- **VPC Endpoints** (3x Interface endpoints): ~$21/month
  - Secrets Manager: ~$7/month
  - Bedrock Runtime: ~$7/month
  - Additional: ~$7/month
- **CloudFront**: Free tier covers most dev usage
- **S3**: Minimal (<$1/month)
- **Lambda**: Free tier covers dev usage
- **API Gateway**: Free tier covers dev usage
- **Bedrock AI Models**: Pay per token (dual-model setup)
  - Nova Lite (chat): ~$0.06 input / $0.24 output per 1M tokens
  - Claude 3.5 Sonnet (security): ~$3 input / $15 output per 1M tokens
  - **Estimated AI cost**: ~$5-6/month for typical usage (98% savings vs all-Claude)

**💵 Estimated Monthly Cost (Dev): ~$23-26/month total**

**Savings**: Removed NAT Gateway saves ~$32/month! 🎉

### When to Add NAT Gateway

The NAT Gateway is **commented out** by default to minimize costs. Add it back when you need to:

- Call external APIs (Google Workspace, Chrome Web Store, etc.)
- Access non-AWS services from Lambda
- Download packages during Lambda execution

To enable NAT Gateway:
1. Uncomment NAT resources in `infrastructure/cloudformation/main.yaml`
2. Uncomment PrivateRoute
3. Redeploy: `./deploy.sh dev`
4. **Cost increase**: +$32/month

### Production Environment Cost (estimated)

- **RDS (db.t4g.medium, Multi-AZ)**: ~$120/month
- **NAT Gateway**: ~$32/month (usually needed for production)
- **VPC Endpoints**: ~$21/month
- **CloudFront**: ~$5-20/month (based on traffic)
- **S3**: ~$5/month
- **Lambda**: ~$10-50/month (based on usage)
- **API Gateway**: ~$3.50 per 1M requests
- **Bedrock**: Based on usage

**💵 Estimated Monthly Cost (Prod): ~$200-250/month + Bedrock usage**

### Cost Optimization Tips

1. ✅ **NAT Gateway removed** (already optimized - saves ~$32/month)
   - Using VPC endpoints exclusively
   - Add back only when needed for external API calls

2. **Use Aurora Serverless v2** (for production):
   - Scales to zero when idle
   - Pay per second of use
   - Good for variable workloads

3. **Enable CloudFront caching**:
   - Already configured with appropriate TTLs
   - Reduces S3 requests and data transfer

4. **Monitor Bedrock usage**:
   - Track token consumption in CloudWatch
   - Implement conversation limits
   - Use streaming for large responses

5. **Right-size RDS instances**:
   - Start with t4g.micro for dev
   - Monitor CPU and connections
   - Upgrade only when needed

## 🔒 Security Best Practices

✅ **Implemented**:
- All resources in private subnets (except NAT/ALB)
- Database encryption at rest
- Secrets stored in AWS Secrets Manager
- VPC endpoints for AWS services
- Security groups restrict traffic
- IAM roles follow least privilege
- CloudFront enforces HTTPS

🚧 **TODO for Production**:
- [ ] Enable RDS Multi-AZ
- [ ] Add RDS Proxy for connection pooling
- [ ] Configure custom domain with ACM certificate
- [ ] Enable WAF on CloudFront
- [ ] Set up CloudWatch alarms
- [ ] Enable AWS Config and CloudTrail
- [ ] Implement API authentication (Cognito)
- [ ] Add rate limiting

## 🧪 Testing

### Backend Tests
```bash
cd backend/lambda/api
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Manual Testing

1. **Health Check**:
   ```bash
   curl https://your-api.execute-api.us-east-1.amazonaws.com/dev/health
   ```

2. **Send Message**:
   ```bash
   curl -X POST https://your-api.execute-api.us-east-1.amazonaws.com/dev/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello Claude!"}'
   ```

## 📊 Monitoring

View logs in CloudWatch:

```bash
# Lambda logs
aws logs tail /aws/lambda/dev-complens-api --follow

# API Gateway logs
aws logs tail /aws/apigateway/dev-complens-api --follow

# RDS logs
aws rds describe-db-log-files --db-instance-identifier dev-complens-postgres
```

## 🔄 CI/CD - Automated Deployments

### GitHub Actions Workflow ✅

**Fully automated CI/CD is configured and ready!** The workflow is located at `.github/workflows/deploy.yml`.

#### Features

✅ **Automatic Deployments**:
- Deploys on push to `main` (production) or `claude/**` branches (dev)
- Manual deployments via GitHub UI (workflow_dispatch)
- Change detection - only deploys what changed

✅ **Three-Stage Pipeline**:
1. **Infrastructure**: CloudFormation stack deployment
2. **Backend**: Lambda function build and deployment
3. **Frontend**: React build and S3/CloudFront deployment

✅ **Smart Change Detection**:
- Analyzes git diff to determine what changed
- Skips unchanged components for faster deployments
- Reduces costs by not deploying unnecessarily

✅ **Environment Management**:
- `main` branch → Production environment
- Other branches → Development environment
- Manual trigger allows choosing environment

#### Setup Instructions

1. **Add AWS Credentials to GitHub Secrets**:

   Go to your repository → Settings → Secrets and variables → Actions

   Add these secrets:
   ```
   AWS_ACCESS_KEY_ID: your-aws-access-key
   AWS_SECRET_ACCESS_KEY: your-aws-secret-key
   ```

2. **Configure Environment Secrets** (optional):

   For production-specific settings, add environment secrets under:
   Settings → Environments → New environment (prod/dev)

3. **Trigger Deployment**:

   ```bash
   # Automatic on push
   git push origin main  # Deploys to prod

   # Or manually via GitHub UI
   Actions → Deploy Complens.ai → Run workflow → Choose environment
   ```

#### Workflow Details

**On every push**, the workflow:

1. ✅ Detects which components changed
2. ✅ Validates CloudFormation template
3. ✅ Deploys/updates infrastructure
4. ✅ Builds and uploads Lambda code
5. ✅ Builds frontend with correct API URL
6. ✅ Deploys to S3 and invalidates CloudFront
7. ✅ Shows deployment summary with URLs

**Deployment Summary Example**:
```
## Deployment Complete! 🚀

Environment: dev
Frontend URL: https://d123abc.cloudfront.net
API URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev

Test your deployment:
curl https://abc123.execute-api.us-east-1.amazonaws.com/dev/health
```

#### Manual Deployment (without CI/CD)

If you prefer manual deployments:

```bash
# Deploy infrastructure
cd infrastructure/cloudformation
./deploy.sh dev

# Deploy backend
cd backend/lambda/api
npm install && npm run build
export LAMBDA_BUCKET=your-bucket
npm run deploy

# Deploy frontend
cd frontend
npm install && npm run build
export FRONTEND_BUCKET=your-bucket
npm run deploy
```

## 🛠️ Development

### Local Development

1. **Frontend**:
   ```bash
   cd frontend
   npm start
   ```
   Visit http://localhost:3000

2. **Backend**:
   Use AWS SAM for local Lambda testing:
   ```bash
   sam local start-api
   ```

## 📝 API Documentation

### Endpoints

#### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "connected",
    "bedrock": "available"
  }
}
```

#### `POST /chat`
Send a message to Claude.

**Request**:
```json
{
  "message": "Hello, Claude!",
  "conversationId": "uuid-optional"
}
```

**Response**:
```json
{
  "conversationId": "uuid",
  "response": "Hello! How can I help you today?",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 20,
    "total_tokens": 32
  }
}
```

#### `GET /conversations`
Get all conversations.

**Response**:
```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "Hello, Claude!",
      "created_at": "2024-01-15T10:00:00Z",
      "updated_at": "2024-01-15T10:05:00Z",
      "message_count": 4
    }
  ],
  "count": 1
}
```

#### `GET /conversations/:id`
Get conversation by ID.

**Response**:
```json
{
  "id": "uuid",
  "title": "Hello, Claude!",
  "created_at": "2024-01-15T10:00:00Z",
  "messages": [
    {
      "role": "user",
      "content": "Hello!",
      "created_at": "2024-01-15T10:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Hi there!",
      "created_at": "2024-01-15T10:00:05Z"
    }
  ]
}
```

### External Security Intelligence

#### `GET /security/nist/search`
Search NIST National Vulnerability Database for security vulnerabilities.

**Query Parameters**:
- `keyword` (required) - Search term (e.g., "wordpress", "chrome extension")
- `limit` (optional) - Number of results (default: 10)
- `useCache` (optional) - Use cached results (default: true)
- `orgId` (optional) - Organization ID for org-specific caching

**Response**:
```json
{
  "source": "nist",
  "query": "wordpress",
  "cached": true,
  "cachedAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-16T10:30:00Z",
  "results": [
    {
      "cveId": "CVE-2024-1234",
      "description": "SQL injection vulnerability in WordPress Plugin XYZ",
      "severity": "HIGH",
      "cvssScore": 7.5,
      "publishedDate": "2024-01-10T00:00:00Z",
      "lastModified": "2024-01-12T00:00:00Z",
      "references": ["https://nvd.nist.gov/..."]
    }
  ],
  "aiAnalysis": "This vulnerability affects WordPress plugins and represents a high-severity risk..."
}
```

#### `GET /security/cve/:cveId`
Get detailed information about a specific CVE.

**Example**: `/security/cve/CVE-2024-1234`

**Query Parameters**:
- `useCache` (optional) - Use cached results (default: true)
- `orgId` (optional) - Organization ID for org-specific caching

**Response**:
```json
{
  "cveId": "CVE-2024-1234",
  "description": "SQL injection in WordPress Plugin XYZ allows remote attackers...",
  "severity": "HIGH",
  "cvssScore": 7.5,
  "cvssVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
  "published": "2024-01-10T00:00:00Z",
  "lastModified": "2024-01-12T00:00:00Z",
  "references": [
    {
      "url": "https://nvd.nist.gov/vuln/detail/CVE-2024-1234",
      "source": "nvd.nist.gov"
    }
  ],
  "affectedProducts": [
    "cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*"
  ],
  "cached": true,
  "cachedAt": "2024-01-15T10:30:00Z",
  "aiAnalysis": "This CVE represents a critical security risk for WordPress installations..."
}
```

#### `GET /security/chrome-extension/:extensionId`
Analyze Chrome browser extension security risks.

**Example**: `/security/chrome-extension/nmmhkkegccagdldgiimedpiccmgmieda`

**Query Parameters**:
- `useCache` (optional) - Use cached results (default: true)
- `orgId` (optional) - Organization ID for org-specific caching

**Response**:
```json
{
  "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda",
  "name": "Google Wallet",
  "version": "1.2.3",
  "description": "Safely store credit cards and passwords",
  "rating": 4.5,
  "userCount": 10000000,
  "developer": "Google LLC",
  "lastUpdated": "November 15, 2024",
  "permissions": [
    "Read and change all your data",
    "Access your tabs",
    "Storage"
  ],
  "storeUrl": "https://chrome.google.com/webstore/detail/...",
  "cached": false,
  "cachedAt": "2024-01-15T10:30:00Z",
  "aiAnalysis": "Security Risk: MEDIUM\n\nKey Concerns:\n- Requests 'Read and change all your data' permission (high risk)\n- Large user base indicates maturity but also high-value target\n- Last updated recently (good sign)\n\nRecommendations for Enterprise:\n- Acceptable for Google Workspace environments\n- Ensure users understand data access permissions\n- Monitor extension updates via admin console\n\nAlternatives: Native browser autofill, enterprise password managers"
}
```

**Permission Risk Levels**:
- **High Risk**: Read/change all data, browsing history, downloads, webRequest, cookies
- **Medium Risk**: Tab access, notifications, external site communication
- **Low Risk**: Storage, basic functionality permissions

**Caching**: All external security data is cached for 24 hours to reduce API calls and improve response times. AI analysis is performed by Claude 3.5 Sonnet to provide actionable security insights.

## 🐛 Troubleshooting

### Lambda timeout errors
- Increase timeout in CloudFormation template
- Check database connection pool settings
- Verify VPC endpoint configuration

### Database connection errors
- Verify security group allows Lambda → RDS traffic
- Check Secrets Manager values
- Ensure RDS is in same VPC as Lambda

### Bedrock access denied
- Verify IAM role has `bedrock:InvokeModel` permission
- Check model ID is correct
- Ensure Bedrock is available in your region

## 📚 Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Amazon Nova Models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-nova.html)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [React Documentation](https://react.dev/)

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

**Built with ❤️ using AWS Bedrock**
