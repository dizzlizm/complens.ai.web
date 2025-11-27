# Deployment Guide

This guide provides detailed step-by-step instructions for deploying Complens.ai to AWS.

## Prerequisites Checklist

- [ ] AWS Account with admin access or appropriate permissions
- [ ] AWS CLI installed and configured (`aws --version`)
- [ ] AWS credentials configured (`aws configure`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Domain name (optional but recommended)

## AWS Permissions Required

Your AWS user/role needs these permissions:

- CloudFormation: Full access
- EC2: VPC, subnet, security group, NAT gateway management
- RDS: Create and manage databases
- S3: Create and manage buckets
- Lambda: Create and manage functions
- API Gateway: Create and manage APIs
- CloudFront: Create and manage distributions
- IAM: Create and manage roles and policies
- Secrets Manager: Create and manage secrets
- Bedrock: Invoke model permissions

## Step-by-Step Deployment

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/complens.ai.git
cd complens.ai
```

### 2. Configure Environment

#### Update CloudFormation Parameters

Edit `infrastructure/cloudformation/parameters/dev.json`:

```json
[
  {
    "ParameterKey": "Environment",
    "ParameterValue": "dev"
  },
  {
    "ParameterKey": "DomainPrefix",
    "ParameterValue": "app.dev"
  },
  {
    "ParameterKey": "DBMasterUsername",
    "ParameterValue": "complensadmin"
  },
  {
    "ParameterKey": "DBMasterPassword",
    "ParameterValue": "REPLACE_WITH_SECURE_PASSWORD"
  }
]
```

**IMPORTANT**: Generate a strong password:
```bash
# Generate a secure password
openssl rand -base64 24
```

### 3. Deploy Infrastructure

```bash
cd infrastructure/cloudformation

# Make deploy script executable
chmod +x deploy.sh

# Deploy to dev environment
./deploy.sh dev

# Or manually with AWS CLI
aws cloudformation create-stack \
  --stack-name complens-dev \
  --template-body file://main.yaml \
  --parameters file://parameters/dev.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

**Expected Duration**: 15-20 minutes

#### Monitor Deployment

```bash
# Watch stack creation
aws cloudformation describe-stack-events \
  --stack-name complens-dev \
  --region us-east-1

# Or use the AWS Console
# https://console.aws.amazon.com/cloudformation
```

#### Capture Outputs

After successful deployment, save these values:

```bash
aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

Save these outputs to a file for reference:
- `CloudFrontURL`
- `ApiGatewayURL`
- `FrontendBucketName`
- `LambdaCodeBucketName`
- `DatabaseEndpoint`
- `SecretsArn`

### 4. Deploy Backend Lambda

#### Install Dependencies

```bash
cd backend/lambda/api
npm install
```

#### Configure Environment Variables

```bash
# Set Lambda code bucket from CloudFormation output
export LAMBDA_BUCKET="your-account-id-dev-complens-lambda-code"
export AWS_REGION="us-east-1"
```

#### Build and Deploy

```bash
# Build Lambda package
npm run build

# This creates a zip file at ../api.zip

# Upload to S3
npm run deploy

# Verify upload
aws s3 ls s3://${LAMBDA_BUCKET}/api/
```

#### Update CloudFormation to Enable Lambda

1. Edit `infrastructure/cloudformation/main.yaml`
2. Uncomment the `ApiLambdaFunction` resource (around line 550)
3. Uncomment the API Gateway integration
4. Redeploy:

```bash
cd infrastructure/cloudformation
./deploy.sh dev
```

#### Test Lambda

```bash
# Get API URL from outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text)

# Test health endpoint
curl ${API_URL}/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-01-15T10:30:00Z",
#   "services": {
#     "database": "connected",
#     "bedrock": "available"
#   }
# }

# Test chat endpoint
curl -X POST ${API_URL}/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Claude!"}'
```

### 5. Deploy Frontend

#### Configure Environment

```bash
cd frontend

# Copy example env file
cp .env.example .env

# Edit .env with your API Gateway URL
# Get URL from CloudFormation outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text)

# Update .env
echo "REACT_APP_API_URL=${API_URL}" > .env
```

#### Install Dependencies

```bash
npm install
```

#### Build Frontend

```bash
npm run build

# This creates a production build in ./build/
```

#### Deploy to S3 and CloudFront

```bash
# Get bucket name from CloudFormation
export FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

# Get CloudFront distribution ID
export CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

# Deploy
npm run deploy

# Or manually:
aws s3 sync build/ s3://${FRONTEND_BUCKET} --delete
aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"
```

#### Access Your Application

```bash
# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text)

echo "Your application is available at: ${CLOUDFRONT_URL}"
```

Visit the URL in your browser!

### 6. Verify Deployment

#### Frontend Checklist

- [ ] Page loads without errors
- [ ] UI displays correctly
- [ ] Console has no errors (F12 → Console)

#### Backend Checklist

- [ ] Health check returns 200
- [ ] Chat endpoint responds to messages
- [ ] Database connection works
- [ ] Bedrock integration works

#### Test Full Flow

1. Open the frontend in a browser
2. Type a message in the chat
3. Verify Claude responds
4. Check CloudWatch logs for any errors

```bash
# View Lambda logs
aws logs tail /aws/lambda/dev-complens-api --follow

# View API Gateway logs
aws logs tail /aws/apigateway/dev-complens-api --follow
```

## Production Deployment

For production deployment:

### 1. Update Parameters

Edit `infrastructure/cloudformation/parameters/prod.json`:

```json
[
  {
    "ParameterKey": "Environment",
    "ParameterValue": "prod"
  },
  {
    "ParameterKey": "DomainPrefix",
    "ParameterValue": "app"
  },
  {
    "ParameterKey": "DBMasterUsername",
    "ParameterValue": "complensadmin"
  },
  {
    "ParameterKey": "DBMasterPassword",
    "ParameterValue": "DIFFERENT_SECURE_PASSWORD"
  }
]
```

### 2. Additional Production Steps

#### Enable RDS Multi-AZ

Edit `main.yaml`:
```yaml
MultiAZ: true  # Already set for prod via !If condition
```

#### Add Custom Domain

1. Request ACM certificate:
```bash
aws acm request-certificate \
  --domain-name app.complens.ai \
  --validation-method DNS \
  --region us-east-1
```

2. Update Route53 with validation records

3. Update CloudFormation template to use certificate

#### Enable CloudWatch Alarms

```bash
# Lambda errors
aws cloudwatch put-metric-alarm \
  --alarm-name complens-prod-lambda-errors \
  --alarm-description "Alert on Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold

# RDS CPU
aws cloudwatch put-metric-alarm \
  --alarm-name complens-prod-rds-cpu \
  --alarm-description "Alert on high RDS CPU" \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```

### 3. Deploy Production Stack

```bash
cd infrastructure/cloudformation
./deploy.sh prod
```

## Rollback Procedures

### Rollback Infrastructure

```bash
# Delete stack (WARNING: This deletes resources!)
aws cloudformation delete-stack --stack-name complens-dev

# Restore from snapshot (for database)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier complens-dev-restore \
  --db-snapshot-identifier complens-dev-snapshot-2024-01-15
```

### Rollback Lambda

```bash
# Upload previous version
aws s3 cp s3://${LAMBDA_BUCKET}/api/previous.zip s3://${LAMBDA_BUCKET}/api/latest.zip

# Update Lambda function
aws lambda update-function-code \
  --function-name dev-complens-api \
  --s3-bucket ${LAMBDA_BUCKET} \
  --s3-key api/latest.zip
```

### Rollback Frontend

```bash
# Sync previous build
aws s3 sync s3://${FRONTEND_BUCKET}-backup/ s3://${FRONTEND_BUCKET}/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_ID} --paths "/*"
```

## Troubleshooting

### CloudFormation Stack Creation Failed

Check stack events:
```bash
aws cloudformation describe-stack-events \
  --stack-name complens-dev \
  --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
```

Common issues:
- **Insufficient permissions**: Check IAM permissions
- **Resource limits**: Check service quotas
- **Name conflicts**: Change stack name or resource names

### Lambda Deployment Issues

```bash
# Check Lambda exists
aws lambda get-function --function-name dev-complens-api

# Check Lambda logs
aws logs tail /aws/lambda/dev-complens-api --follow

# Test Lambda directly
aws lambda invoke \
  --function-name dev-complens-api \
  --payload '{"httpMethod":"GET","path":"/health"}' \
  response.json
cat response.json
```

### Database Connection Issues

```bash
# Test from Lambda security group
# Launch EC2 instance in same security group as Lambda
# Try connecting to RDS

# Check security group rules
aws ec2 describe-security-groups \
  --group-ids sg-xxxxxx
```

### Bedrock Access Issues

```bash
# Check IAM role permissions
aws iam get-role-policy \
  --role-name dev-complens-lambda-role \
  --policy-name BedrockAccess

# Test Bedrock access
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-sonnet-4-20250514-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Hi"}]}' \
  output.json
```

## Monitoring and Maintenance

### CloudWatch Dashboards

Create a dashboard:
```bash
aws cloudwatch put-dashboard \
  --dashboard-name complens-dev \
  --dashboard-body file://cloudwatch-dashboard.json
```

### Cost Monitoring

```bash
# View costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### Backup Strategy

#### RDS Automated Backups
Already enabled with 1-7 day retention

#### Manual Snapshot
```bash
aws rds create-db-snapshot \
  --db-instance-identifier dev-complens-postgres \
  --db-snapshot-identifier complens-dev-snapshot-$(date +%Y%m%d)
```

#### S3 Versioning
Already enabled on all buckets

## Next Steps

After successful deployment:

1. [ ] Set up custom domain
2. [ ] Configure user authentication (Cognito)
3. [ ] Enable CloudWatch alarms
4. [ ] Set up CI/CD pipeline
5. [ ] Configure backups
6. [ ] Review security settings
7. [ ] Load test the application
8. [ ] Set up monitoring dashboards

## Support

For issues:
- Check CloudWatch logs
- Review CloudFormation events
- Consult AWS documentation
- Open GitHub issue

---

**Deployment completed successfully! 🚀**
