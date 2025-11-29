#!/bin/bash
# ============================================================================
# Check Cognito Configuration
# ============================================================================
# Verifies that Cognito is properly configured in CloudFormation
# ============================================================================

set -e

STACK_NAME="complens-dev"
REGION="us-east-1"

echo "============================================"
echo "Checking Cognito Configuration"
echo "============================================"
echo ""

echo "📡 Fetching from CloudFormation stack: $STACK_NAME"
echo ""

# Get Cognito outputs
COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' \
  --output text 2>/dev/null || echo "NOT_FOUND")

COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolClientId`].OutputValue' \
  --output text 2>/dev/null || echo "NOT_FOUND")

COGNITO_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolDomain`].OutputValue' \
  --output text 2>/dev/null || echo "NOT_FOUND")

API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text 2>/dev/null || echo "NOT_FOUND")

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text 2>/dev/null || echo "NOT_FOUND")

echo "============================================"
echo "CloudFormation Outputs:"
echo "============================================"
echo "Cognito User Pool ID: $COGNITO_USER_POOL_ID"
echo "Cognito Client ID: $COGNITO_CLIENT_ID"
echo "Cognito Domain: $COGNITO_DOMAIN"
echo "API Gateway URL: $API_URL"
echo "CloudFront URL: $CLOUDFRONT_URL"
echo ""

# Verify Cognito User Pool exists
if [ "$COGNITO_USER_POOL_ID" != "NOT_FOUND" ] && [ -n "$COGNITO_USER_POOL_ID" ]; then
  echo "============================================"
  echo "Cognito User Pool Details:"
  echo "============================================"

  aws cognito-idp describe-user-pool \
    --user-pool-id $COGNITO_USER_POOL_ID \
    --region $REGION \
    --query 'UserPool.{Name:Name,Status:Status,CreationDate:CreationDate,LastModifiedDate:LastModifiedDate,EstimatedUsers:EstimatedNumberOfUsers}' \
    --output table

  echo ""
  echo "User Pool Client Details:"
  aws cognito-idp describe-user-pool-client \
    --user-pool-id $COGNITO_USER_POOL_ID \
    --client-id $COGNITO_CLIENT_ID \
    --region $REGION \
    --query 'UserPoolClient.{ClientName:ClientName,AllowedOAuthFlows:AllowedOAuthFlows,CallbackURLs:CallbackURLs}' \
    --output table

  echo ""
  echo "Users in pool:"
  USER_COUNT=$(aws cognito-idp list-users \
    --user-pool-id $COGNITO_USER_POOL_ID \
    --region $REGION \
    --query 'length(Users)' \
    --output text)

  echo "Total users: $USER_COUNT"

  if [ "$USER_COUNT" -gt 0 ]; then
    echo ""
    echo "User list:"
    aws cognito-idp list-users \
      --user-pool-id $COGNITO_USER_POOL_ID \
      --region $REGION \
      --query 'Users[].[Username,UserStatus,Attributes[?Name==`email`].Value | [0]]' \
      --output table
  fi

  echo ""
  echo "✅ Cognito is configured correctly!"
else
  echo "❌ Cognito User Pool not found in CloudFormation outputs!"
  echo ""
  echo "This means either:"
  echo "1. CloudFormation stack hasn't been deployed yet"
  echo "2. Cognito resources aren't in the stack"
  echo ""
  echo "Run this to deploy the stack:"
  echo "  cd infrastructure/cloudformation"
  echo "  aws cloudformation deploy --template-file main.yaml --stack-name complens-dev ..."
fi

echo ""
echo "============================================"
echo "What to do next:"
echo "============================================"
echo ""

if [ "$COGNITO_USER_POOL_ID" != "NOT_FOUND" ]; then
  echo "✅ Cognito is set up correctly"
  echo ""
  echo "To deploy frontend with correct Cognito config:"
  echo "  ./scripts/deploy-frontend-with-cognito.sh"
  echo ""
  echo "Or push your code to trigger GitHub Actions deployment"
else
  echo "❌ Need to deploy CloudFormation stack first"
  echo ""
  echo "The stack should create:"
  echo "  - Cognito User Pool"
  echo "  - Cognito User Pool Client"
  echo "  - Cognito Domain"
fi

echo ""
