#!/bin/bash
# Manual Lambda Deployment Script
# Use this if GitHub Actions is stuck or failed

set -e

echo "🚀 Deploying Lambda Function Manually"
echo "======================================"
echo ""

# Configuration
REGION="us-east-1"
FUNCTION_NAME="dev-complens-api"
STACK_NAME="complens-dev"

# Get AWS Account ID
echo "1️⃣  Getting AWS Account ID..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ AWS CLI not configured or credentials not available"
  echo "   Please configure AWS CLI first: aws configure"
  exit 1
fi

echo "✅ AWS Account: ${ACCOUNT_ID}"
echo ""

# Set Lambda bucket name
LAMBDA_BUCKET="${ACCOUNT_ID}-dev-complens-lambda-code"
echo "2️⃣  Lambda bucket: ${LAMBDA_BUCKET}"
echo ""

# Navigate to Lambda directory
echo "3️⃣  Building Lambda package..."
cd backend/lambda/api

# Clean install (production only)
echo "   - Removing old dependencies..."
rm -rf node_modules package-lock.json

echo "   - Installing production dependencies..."
npm install --production --quiet

# Create deployment package
echo "   - Creating zip file..."
zip -r -q /tmp/api-deploy-$(date +%s).zip . \
  -x '*.git*' '.gitignore' 'node_modules/.cache/*' 'tests/*' '*.md'

DEPLOY_ZIP=$(ls -t /tmp/api-deploy-*.zip | head -1)
ZIP_SIZE=$(du -h "$DEPLOY_ZIP" | cut -f1)

echo "✅ Package created: $DEPLOY_ZIP ($ZIP_SIZE)"
echo ""

# Upload to S3
echo "4️⃣  Uploading to S3..."
aws s3 cp "$DEPLOY_ZIP" \
  "s3://${LAMBDA_BUCKET}/api/latest.zip" \
  --region ${REGION}

echo "✅ Uploaded to S3"
echo ""

# Update Lambda function
echo "5️⃣  Updating Lambda function..."
aws lambda update-function-code \
  --function-name ${FUNCTION_NAME} \
  --s3-bucket ${LAMBDA_BUCKET} \
  --s3-key api/latest.zip \
  --region ${REGION} \
  --output json > /tmp/lambda-update.json

echo "✅ Lambda function updated"
echo ""

# Wait for update to complete
echo "6️⃣  Waiting for update to complete (this may take 30-60 seconds)..."
aws lambda wait function-updated \
  --function-name ${FUNCTION_NAME} \
  --region ${REGION}

# Get function info
LAST_MODIFIED=$(cat /tmp/lambda-update.json | jq -r '.LastModified')
CODE_SIZE=$(cat /tmp/lambda-update.json | jq -r '.CodeSize')
RUNTIME=$(cat /tmp/lambda-update.json | jq -r '.Runtime')

echo "✅ Update complete!"
echo ""
echo "📊 Function Details:"
echo "   Runtime: ${RUNTIME}"
echo "   Code Size: ${CODE_SIZE} bytes"
echo "   Last Modified: ${LAST_MODIFIED}"
echo ""

# Test the function
echo "7️⃣  Testing OPTIONS endpoint..."
echo ""

API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text \
  --region ${REGION})

if [ -n "$API_URL" ]; then
  echo "   API URL: ${API_URL}/chat"
  echo ""
  echo "   Testing preflight request..."

  curl -X OPTIONS \
    -H "Origin: https://dev.complens.ai" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type,Authorization" \
    -i \
    "${API_URL}/chat" 2>&1 | grep -E "(HTTP/|access-control-|Access-Control-)" || true

  echo ""
  echo "✅ Check the response above for:"
  echo "   - HTTP/2 200 (should be 200, not 500)"
  echo "   - access-control-allow-origin: https://dev.complens.ai"
  echo "   - access-control-allow-credentials: true"
else
  echo "⚠️  Could not get API URL from CloudFormation stack"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Test your app at: https://dev.complens.ai"
echo "2. Check CloudWatch Logs if issues persist:"
echo "   aws logs tail /aws/lambda/${FUNCTION_NAME} --follow --region ${REGION}"
echo ""
