#!/bin/bash
# ============================================================================
# Deploy Frontend with Cognito Configuration
# ============================================================================
# This script builds and deploys the frontend with proper Cognito config
# ============================================================================

set -e

STACK_NAME="complens-dev"
REGION="us-east-1"

echo "============================================"
echo "Frontend Deployment with Cognito Config"
echo "============================================"
echo ""

# Get CloudFormation outputs
echo "📡 Fetching configuration from CloudFormation..."

API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text)

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text)

COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolClientId`].OutputValue' \
  --output text)

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text)

echo "✅ Configuration retrieved:"
echo "   API URL: $API_URL"
echo "   Frontend Bucket: $FRONTEND_BUCKET"
echo "   Cognito Pool ID: $COGNITO_USER_POOL_ID"
echo "   Cognito Client ID: $COGNITO_CLIENT_ID"
echo "   CloudFront URL: $CLOUDFRONT_URL"
echo ""

# Verify all values are set
if [ -z "$API_URL" ] || [ -z "$FRONTEND_BUCKET" ] || [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_CLIENT_ID" ]; then
  echo "❌ ERROR: Missing required configuration values"
  echo "   Make sure CloudFormation stack is deployed and has all outputs"
  exit 1
fi

echo "============================================"
echo "Building Frontend..."
echo "============================================"
echo ""

cd frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build with environment variables
echo "🔨 Building React app with Cognito configuration..."
REACT_APP_API_URL="$API_URL" \
REACT_APP_COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
REACT_APP_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
REACT_APP_AWS_REGION="$REGION" \
npm run build

echo "✅ Build complete!"
echo ""

echo "============================================"
echo "Deploying to S3..."
echo "============================================"
echo ""

# Deploy to S3
aws s3 sync build/ s3://${FRONTEND_BUCKET}/ \
  --delete \
  --region ${REGION} \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.map"

# Upload index.html separately with no cache
aws s3 cp build/index.html s3://${FRONTEND_BUCKET}/index.html \
  --region ${REGION} \
  --cache-control "public,max-age=0,must-revalidate" \
  --content-type "text/html"

echo "✅ Deployed to S3!"
echo ""

echo "============================================"
echo "Invalidating CloudFront cache..."
echo "============================================"
echo ""

# Get CloudFront distribution ID
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[?DomainName=='${FRONTEND_BUCKET}.s3.amazonaws.com']].Id | [0]" \
  --output text \
  --region ${REGION} 2>/dev/null || echo "")

if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
  echo "Invalidating distribution: $DISTRIBUTION_ID"
  aws cloudfront create-invalidation \
    --distribution-id ${DISTRIBUTION_ID} \
    --paths "/*" \
    --region ${REGION}
  echo "✅ CloudFront cache invalidated!"
else
  echo "⚠️  CloudFront distribution not found, skipping invalidation"
  echo "   The deployment will still work, but may take longer to update"
fi

cd ..

echo ""
echo "============================================"
echo "✅ Deployment Complete!"
echo "============================================"
echo ""
echo "Your app is now available at:"
echo "  $CLOUDFRONT_URL"
echo ""
echo "Cognito configuration:"
echo "  User Pool ID: $COGNITO_USER_POOL_ID"
echo "  Client ID: $COGNITO_CLIENT_ID"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for CloudFront to update"
echo "2. Hard refresh your browser (Ctrl+Shift+R)"
echo "3. Try to sign up or log in"
echo "4. You should now see the Cognito login working!"
echo ""
