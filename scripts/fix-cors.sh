#!/bin/bash
# Quick CORS fix for API Gateway
# This updates CORS directly without waiting for CloudFormation

set -e

REGION="us-east-1"
STACK_NAME="complens-dev"

echo "🔧 Fixing API Gateway CORS..."
echo ""

# Get API Gateway ID
API_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text | grep -oP '(?<=https://)[^.]+')

if [ -z "$API_ID" ]; then
  echo "❌ Could not find API Gateway ID"
  exit 1
fi

echo "📍 API Gateway ID: ${API_ID}"
echo ""

# Update CORS configuration (must match CloudFormation main.yaml)
echo "Updating CORS to allow https://dev.complens.ai with credentials..."

aws apigatewayv2 update-api \
  --api-id ${API_ID} \
  --region ${REGION} \
  --cors-configuration '{
    "AllowOrigins": ["https://dev.complens.ai", "http://localhost:3000"],
    "AllowMethods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "AllowHeaders": ["Content-Type", "Authorization", "X-Requested-With"],
    "MaxAge": 300,
    "AllowCredentials": true
  }'

echo ""
echo "✅ CORS updated!"
echo ""
echo "Current CORS configuration:"
aws apigatewayv2 get-api \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'CorsConfiguration' \
  --output json | jq .

echo ""
echo "🧪 Test your app now: https://dev.complens.ai"
echo ""
