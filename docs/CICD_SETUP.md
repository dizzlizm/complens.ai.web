# CI/CD Setup Guide

This guide walks you through setting up automated deployments with GitHub Actions for Complens.ai.

## Prerequisites

- GitHub repository with the Complens.ai code
- AWS account with appropriate permissions
- AWS CLI configured locally (for initial setup)

## Step 1: Create AWS IAM User for GitHub Actions

### Create IAM User

```bash
aws iam create-user --user-name github-actions-complens
```

### Attach Required Policies

```bash
# CloudFormation permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess

# S3 permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Lambda permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess

# IAM permissions (for CloudFormation)
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

# EC2/VPC permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess

# RDS permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/AmazonRDSFullAccess

# CloudFront permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/CloudFrontFullAccess

# Secrets Manager permissions
aws iam attach-user-policy \
  --user-name github-actions-complens \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

### Create Access Keys

```bash
aws iam create-access-key --user-name github-actions-complens
```

**Save the output** - you'll need these credentials for GitHub Secrets:
```json
{
  "AccessKeyId": "AKIA...",
  "SecretAccessKey": "..."
}
```

## Step 2: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

Add these secrets:

| Name | Value |
|------|-------|
| `AWS_ACCESS_KEY_ID` | The AccessKeyId from Step 1 |
| `AWS_SECRET_ACCESS_KEY` | The SecretAccessKey from Step 1 |

![GitHub Secrets Setup](https://docs.github.com/assets/images/help/settings/actions-secrets-and-variables.png)

## Step 3: Configure GitHub Environments (Optional)

For additional protection on production deployments:

1. Go to: **Settings** → **Environments**
2. Click **New environment**
3. Create two environments:
   - `dev`
   - `prod`

### For Production Environment

Add protection rules:
- ✅ Required reviewers (select team members)
- ✅ Wait timer (e.g., 5 minutes)
- ✅ Deployment branches: only `main`

## Step 4: Verify Workflow File

The workflow file is already created at `.github/workflows/deploy.yml`.

Verify it exists:
```bash
cat .github/workflows/deploy.yml
```

## Step 5: Test the CI/CD Pipeline

### Automatic Deployment (Recommended)

1. Make a change to the code:
   ```bash
   echo "# Test" >> README.md
   git add README.md
   git commit -m "Test CI/CD pipeline"
   git push origin main  # or your branch
   ```

2. Watch the deployment:
   - Go to GitHub repository → **Actions** tab
   - You should see a new workflow run
   - Click on it to see real-time logs

### Manual Deployment

1. Go to: **Actions** → **Deploy Complens.ai**
2. Click **Run workflow**
3. Choose:
   - Branch to deploy from
   - Environment (`dev` or `prod`)
4. Click **Run workflow**

## Step 6: Monitor Deployment

### GitHub Actions UI

The workflow provides detailed logs for each step:

```
1. Setup Deployment
   ✅ Determine environment: dev
   ✅ Detect changes: infrastructure=true, backend=true, frontend=true

2. Deploy Infrastructure
   ✅ Validate CloudFormation template
   ✅ Deploy CloudFormation stack
   ✅ Get stack outputs

3. Deploy Backend
   ✅ Install dependencies
   ✅ Build Lambda package
   ✅ Upload to S3
   ✅ Update Lambda function

4. Deploy Frontend
   ✅ Build React app
   ✅ Deploy to S3
   ✅ Invalidate CloudFront cache
   ✅ Show deployment summary
```

### Deployment Summary

After successful deployment, you'll see:

```markdown
## Deployment Complete! 🚀

Environment: dev
Frontend URL: https://d123abc.cloudfront.net
API URL: https://abc123.execute-api.us-east-1.amazonaws.com/dev

### Test your deployment:
```bash
# Health check
curl https://abc123.execute-api.us-east-1.amazonaws.com/dev/health

# Visit frontend
open https://d123abc.cloudfront.net
```

## How It Works

### Branch-Based Deployments

| Branch | Environment | Trigger |
|--------|-------------|---------|
| `main` | Production | Automatic on push |
| `claude/**` | Development | Automatic on push |
| Any | Choose | Manual trigger |

### Change Detection

The workflow detects which components changed:

```bash
# If only frontend changed
infrastructure: false  # Skipped ⏭️
backend: false         # Skipped ⏭️
frontend: true         # Deployed ✅

# If everything changed
infrastructure: true   # Deployed ✅
backend: true          # Deployed ✅
frontend: true         # Deployed ✅
```

This saves time and reduces costs by only deploying what changed.

### Deployment Flow

```
Push to GitHub
    ↓
Setup Job
    ├── Determine environment (dev/prod)
    ├── Detect file changes
    └── Set outputs
    ↓
Infrastructure Job (if changed)
    ├── Validate template
    ├── Deploy/update stack
    ├── Wait for completion
    └── Export outputs
    ↓
Backend Job (if changed)
    ├── Install dependencies
    ├── Build Lambda package
    ├── Upload to S3
    └── Update Lambda function
    ↓
Frontend Job (if changed)
    ├── Build React app
    ├── Upload to S3
    ├── Invalidate CloudFront
    └── Show summary
```

## Troubleshooting

### "No such file or directory" Errors

**Cause**: Missing `package-lock.json` files

**Solution**:
```bash
# Generate lock files
cd backend/lambda/api
npm install

cd ../../../frontend
npm install

# Commit lock files
git add */package-lock.json
git commit -m "Add package-lock files"
git push
```

### CloudFormation Deployment Fails

**Check**:
1. AWS credentials are correct
2. IAM user has required permissions
3. CloudFormation template is valid
4. Parameter file exists for environment

**Validate locally**:
```bash
cd infrastructure/cloudformation
aws cloudformation validate-template --template-body file://main.yaml
```

### Lambda Function Not Found

**This is expected** on first deployment!

The Lambda function is commented out in CloudFormation. To enable:

1. Edit `infrastructure/cloudformation/main.yaml`
2. Uncomment the `ApiLambdaFunction` resource (around line 550)
3. Commit and push
4. Workflow will update stack and create Lambda

### Frontend Shows Old Content

**Cause**: CloudFront cache not invalidated

**Solution**: The workflow automatically invalidates cache, but you can do it manually:

```bash
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query 'DistributionList.Items[0].Id' \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

### Secrets Not Available

**Check**:
1. Secrets are added to repository (not organization)
2. Secret names match exactly (case-sensitive)
3. Workflow has permission to access secrets

## Best Practices

### 1. Use Environments for Production

```yaml
# In workflow file
environment:
  name: ${{ needs.setup.outputs.environment }}
```

This adds:
- Manual approval gates
- Environment-specific secrets
- Deployment protection rules

### 2. Tag Releases

```bash
# After successful deployment
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### 3. Monitor Costs

Check AWS costs after each deployment:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

### 4. Review Deployment Logs

Always review the deployment summary in GitHub Actions to ensure:
- Correct environment deployed
- All components updated
- No errors in logs

### 5. Test After Deployment

```bash
# Health check
curl https://your-api-url/health

# Test chat endpoint
curl -X POST https://your-api-url/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Test deployment"}'

# Visit frontend
open https://your-cloudfront-url
```

## Rollback Procedure

If a deployment fails or introduces issues:

### Option 1: Revert Commit and Redeploy

```bash
git revert HEAD
git push origin main
```

The workflow will automatically deploy the previous version.

### Option 2: Manual Rollback

```bash
# Rollback CloudFormation
aws cloudformation update-stack \
  --stack-name complens-dev \
  --use-previous-template

# Rollback Lambda
aws lambda update-function-code \
  --function-name dev-complens-api \
  --s3-bucket your-bucket \
  --s3-key api/previous-version.zip

# Rollback Frontend
aws s3 sync s3://backup-bucket/ s3://frontend-bucket/ --delete
aws cloudfront create-invalidation --distribution-id xxx --paths "/*"
```

### Option 3: Re-run Workflow from Previous Commit

1. Go to **Actions** → **Deploy Complens.ai**
2. Find the last successful run
3. Click **Re-run all jobs**

## Advanced: Staging Environment

To add a staging environment:

1. Create new CloudFormation parameters:
   ```bash
   cp infrastructure/cloudformation/parameters/dev.json \
      infrastructure/cloudformation/parameters/staging.json
   ```

2. Update workflow to support staging:
   ```yaml
   - name: Determine environment
     run: |
       if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
         echo "environment=prod" >> $GITHUB_OUTPUT
       elif [[ "${{ github.ref }}" == "refs/heads/staging" ]]; then
         echo "environment=staging" >> $GITHUB_OUTPUT
       else
         echo "environment=dev" >> $GITHUB_OUTPUT
       fi
   ```

3. Create staging branch:
   ```bash
   git checkout -b staging
   git push origin staging
   ```

## Security Considerations

### IAM Best Practices

- ✅ Use least privilege IAM policies
- ✅ Rotate access keys regularly
- ✅ Enable MFA on AWS root account
- ✅ Use AWS Organizations for account separation

### Secrets Management

- ✅ Never commit secrets to git
- ✅ Use GitHub environment secrets for production
- ✅ Rotate secrets after team member changes
- ✅ Use AWS Secrets Manager for application secrets

### Deployment Safety

- ✅ Require code review before merging to main
- ✅ Enable branch protection rules
- ✅ Use manual approval for production
- ✅ Test in dev before promoting to prod

---

## Summary

You now have:

✅ Fully automated CI/CD pipeline
✅ Environment-based deployments (dev/prod)
✅ Change detection for efficient deployments
✅ Deployment summaries with URLs
✅ Rollback procedures
✅ Security best practices

**Next**: Push your code and watch it deploy automatically! 🚀

---

**Last Updated**: 2025-11-27
**Maintainer**: Complens.ai Team
