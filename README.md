# Complens.ai

A serverless AI-powered application built on AWS using **Claude Sonnet 4** via Amazon Bedrock, React frontend, Lambda functions, PostgreSQL, and full VPC infrastructure.

## 🏗️ Architecture Overview

This application follows a modern serverless architecture with the following components:

### Infrastructure
- **Frontend**: React SPA hosted on S3, delivered via CloudFront
- **Backend**: AWS Lambda functions (Node.js)
- **Database**: Amazon RDS PostgreSQL (encrypted, private subnets)
- **AI Model**: Claude Sonnet 4 via Amazon Bedrock (pay-per-use)
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

The application uses **Claude Sonnet 4** (`anthropic.claude-sonnet-4-20250514-v1:0`).

To change the model, edit `backend/lambda/api/services/bedrock.js`:

```javascript
this.modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
```

Available Claude models in Bedrock:
- `anthropic.claude-sonnet-4-20250514-v1:0` - Claude Sonnet 4 (recommended)
- `anthropic.claude-3-5-sonnet-20241022-v2:0` - Claude 3.5 Sonnet
- `anthropic.claude-3-opus-20240229-v1:0` - Claude 3 Opus

### Database Schema

The database schema is automatically created on first Lambda execution:

- **conversations** table: Stores conversation metadata
- **messages** table: Stores individual messages (user/assistant)

## 💰 Cost Estimates

### Development Environment (dev)
- **RDS PostgreSQL (db.t4g.micro)**: ~$15/month
- **NAT Gateway**: ~$32/month (~$0.045/hour)
- **CloudFront**: Free tier covers most dev usage
- **S3**: Minimal (<$1/month)
- **Lambda**: Free tier covers dev usage
- **API Gateway**: Free tier covers dev usage
- **Bedrock (Claude Sonnet 4)**: Pay per token
  - Input: ~$3 per 1M tokens
  - Output: ~$15 per 1M tokens

**Estimated Monthly Cost (Dev)**: ~$50-70 + usage-based Bedrock costs

### Cost Optimization Tips

1. **Remove NAT Gateway** (saves ~$32/month):
   - Use VPC endpoints only (already configured)
   - Comment out NAT Gateway in CloudFormation
   - Requires Lambda to only access AWS services

2. **Use Aurora Serverless v2** (for production):
   - Pay per second when database is active
   - Auto-scales based on load

3. **Enable CloudFront caching**:
   - Reduces S3 data transfer costs
   - Improves performance

4. **Monitor Bedrock usage**:
   - Use shorter context windows when possible
   - Implement conversation limits

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

## 🔄 CI/CD

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy Complens.ai

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy Lambda
        run: |
          cd backend/lambda/api
          npm install
          npm run build
          npm run deploy

      - name: Deploy Frontend
        run: |
          cd frontend
          npm install
          npm run build
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
- [Claude API Documentation](https://docs.anthropic.com/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [React Documentation](https://react.dev/)

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

**Built with ❤️ using AWS Bedrock and Claude Sonnet 4**
