#!/bin/bash
# Debug script for Complens.ai deployment issues

set -e

STACK_NAME="complens-dev"
REGION="us-east-1"

echo "🔍 Checking Complens.ai Deployment Status..."
echo ""

# Check if stack exists
echo "1️⃣  CloudFormation Stack Status:"
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
  echo "   ❌ Stack not found!"
  echo "   Run: cd infrastructure/cloudformation && ./deploy.sh dev"
  exit 1
else
  echo "   ✅ Stack Status: ${STACK_STATUS}"
fi

echo ""

# Get outputs
echo "2️⃣  Stack Outputs:"
aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
  --output table

echo ""

# Check ACM Certificate
echo "3️⃣  ACM Certificate Status:"
CERT_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CustomDomainName`].OutputValue' \
  --output text 2>/dev/null)

if [ -n "$CERT_ARN" ] && [ "$CERT_ARN" != "None" ]; then
  # Find certificate for dev.complens.ai
  CERT_STATUS=$(aws acm list-certificates \
    --region ${REGION} \
    --query "CertificateSummaryList[?DomainName=='dev.complens.ai'].Status | [0]" \
    --output text 2>/dev/null || echo "NOT_FOUND")

  if [ "$CERT_STATUS" = "ISSUED" ]; then
    echo "   ✅ Certificate: ISSUED"
  elif [ "$CERT_STATUS" = "PENDING_VALIDATION" ]; then
    echo "   ⏳ Certificate: PENDING_VALIDATION"
    echo "   Check Route53 for validation records"
  else
    echo "   ❓ Certificate: ${CERT_STATUS}"
  fi
else
  echo "   ⚠️  No custom domain configured"
fi

echo ""

# Check CloudFront distribution
echo "4️⃣  CloudFront Distribution:"
CF_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text)

if [ -n "$CF_URL" ]; then
  echo "   📍 CloudFront URL: ${CF_URL}"

  # Check if distribution has custom domain
  DOMAIN_NAME=$(echo "$CF_URL" | sed 's/https:\/\///')
  CF_ALIASES=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${DOMAIN_NAME}'].Aliases.Items[]" \
    --output text 2>/dev/null || echo "")

  if [ -n "$CF_ALIASES" ]; then
    echo "   ✅ Custom Domain: ${CF_ALIASES}"
  else
    echo "   ⚠️  No custom domain alias"
  fi
fi

echo ""

# Check DNS
echo "5️⃣  DNS Status:"
if command -v dig &> /dev/null; then
  DEV_DNS=$(dig +short dev.complens.ai 2>/dev/null || echo "")
  if [ -n "$DEV_DNS" ]; then
    echo "   ✅ dev.complens.ai resolves to: ${DEV_DNS}"
  else
    echo "   ❌ dev.complens.ai does not resolve"
    echo "   CloudFront distribution might still be deploying"
  fi
else
  echo "   ⚠️  'dig' command not available, skipping DNS check"
fi

echo ""

# Check API Gateway
echo "6️⃣  API Gateway CORS:"
API_ID=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text | sed 's/.*\/\/\(.*\)\.execute-api.*/\1/')

if [ -n "$API_ID" ]; then
  CORS_CONFIG=$(aws apigatewayv2 get-api \
    --api-id ${API_ID} \
    --region ${REGION} \
    --query 'CorsConfiguration' \
    --output json 2>/dev/null || echo "{}")

  echo "   CORS Configuration:"
  echo "${CORS_CONFIG}" | jq .
else
  echo "   ⚠️  Could not get API ID"
fi

echo ""

# Test API endpoint
echo "7️⃣  Testing API Endpoint:"
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text)

if [ -n "$API_URL" ]; then
  echo "   Testing: ${API_URL}/health"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ API Health: OK (200)"
    RESPONSE=$(curl -s "${API_URL}/health" 2>/dev/null)
    echo "   Response: ${RESPONSE}"
  else
    echo "   ❌ API Health: FAILED (${HTTP_CODE})"
  fi
fi

echo ""

# Check Secrets Manager
echo "8️⃣  Secrets Manager:"
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
  --output text)

if [ -n "$SECRET_ARN" ]; then
  SECRET_KEYS=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRET_ARN}" \
    --region ${REGION} \
    --query 'SecretString' \
    --output text | jq -r 'keys[]' 2>/dev/null || echo "")

  echo "   ✅ Secret Keys:"
  echo "${SECRET_KEYS}" | while read key; do
    echo "      - ${key}"
  done

  # Check for Google OAuth
  HAS_GOOGLE=$(echo "${SECRET_KEYS}" | grep -c "googleClientId" || echo "0")
  if [ "$HAS_GOOGLE" -gt "0" ]; then
    echo "   ✅ Google OAuth credentials present"
  else
    echo "   ⚠️  Google OAuth credentials missing"
    echo "      Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to GitHub Secrets"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "🎯 Next Steps:"
echo ""

if [ "$CERT_STATUS" = "PENDING_VALIDATION" ]; then
  echo "1. Wait for ACM certificate validation (can take 30 mins)"
  echo "   Check: AWS Console → Certificate Manager"
fi

if [ -z "$DEV_DNS" ] || [ "$DEV_DNS" = "" ]; then
  echo "2. Wait for CloudFront distribution to deploy (can take 20 mins)"
  echo "   Check: AWS Console → CloudFront"
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "3. Check Lambda function logs:"
  echo "   aws logs tail /aws/lambda/dev-complens-api --follow"
fi

echo ""
echo "📱 Once ready, visit: https://dev.complens.ai"
echo "═══════════════════════════════════════════════════════════"
