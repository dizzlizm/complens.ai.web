#!/bin/bash
# Comprehensive API debugging script

set -e

STACK_NAME="complens-dev"
REGION="us-east-1"

echo "🔍 Debugging API Gateway and Lambda..."
echo "========================================"
echo ""

# 1. Get API Gateway info
echo "1️⃣  API Gateway Configuration:"
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ]; then
  echo "   ❌ API Gateway URL not found in stack outputs"
  exit 1
fi

API_ID=$(echo "$API_URL" | grep -oP '(?<=https://)[^.]+')
echo "   📍 API URL: ${API_URL}"
echo "   📍 API ID: ${API_ID}"

# 2. Check CORS configuration
echo ""
echo "2️⃣  Current CORS Configuration:"
CORS=$(aws apigatewayv2 get-api \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'CorsConfiguration' \
  --output json 2>/dev/null)

if [ "$CORS" = "null" ] || [ -z "$CORS" ]; then
  echo "   ❌ No CORS configuration found!"
else
  echo "$CORS" | jq .

  # Check if dev.complens.ai is in allowed origins
  if echo "$CORS" | jq -r '.AllowOrigins[]' | grep -q "dev.complens.ai"; then
    echo "   ✅ dev.complens.ai is in AllowOrigins"
  else
    echo "   ❌ dev.complens.ai NOT in AllowOrigins"
    echo "   Run: ./scripts/fix-cors.sh"
  fi
fi

# 3. Check API Gateway Routes
echo ""
echo "3️⃣  API Gateway Routes:"
ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].[RouteKey,Target]' \
  --output table 2>/dev/null)

if [ -z "$ROUTES" ]; then
  echo "   ⚠️  No routes configured!"
  echo "   This means API Gateway is not connected to Lambda"
else
  echo "$ROUTES"
fi

# 4. Check Lambda function
echo ""
echo "4️⃣  Lambda Function:"
LAMBDA_NAME="${STACK_NAME/complens-/}-complens-api"
LAMBDA_EXISTS=$(aws lambda get-function \
  --function-name ${LAMBDA_NAME} \
  --region ${REGION} 2>&1 || echo "NOT_FOUND")

if echo "$LAMBDA_EXISTS" | grep -q "ResourceNotFoundException"; then
  echo "   ❌ Lambda function '${LAMBDA_NAME}' does NOT exist!"
  echo ""
  echo "   The Lambda function hasn't been created yet."
  echo "   You need to uncomment the Lambda resource in main.yaml"
  echo "   OR deploy the Lambda separately."
  echo ""
  echo "   Quick check - does the Lambda code exist?"
  if [ -f "backend/lambda/api/index.js" ]; then
    echo "   ✅ Lambda code exists at backend/lambda/api/index.js"
  else
    echo "   ❌ Lambda code not found"
  fi
else
  echo "   ✅ Lambda function exists: ${LAMBDA_NAME}"

  # Get Lambda details
  LAMBDA_STATE=$(aws lambda get-function \
    --function-name ${LAMBDA_NAME} \
    --region ${REGION} \
    --query 'Configuration.State' \
    --output text 2>/dev/null)

  echo "   📊 State: ${LAMBDA_STATE}"

  # Check if Lambda is in VPC
  VPC_CONFIG=$(aws lambda get-function \
    --function-name ${LAMBDA_NAME} \
    --region ${REGION} \
    --query 'Configuration.VpcConfig' \
    --output json 2>/dev/null)

  if [ "$VPC_CONFIG" != "null" ] && [ -n "$VPC_CONFIG" ]; then
    echo "   🌐 VPC: Configured"
    echo "$VPC_CONFIG" | jq -r '.SubnetIds[]' | while read subnet; do
      echo "      - Subnet: $subnet"
    done
  else
    echo "   ⚠️  VPC: Not configured"
  fi

  # Get last update time
  LAST_MODIFIED=$(aws lambda get-function \
    --function-name ${LAMBDA_NAME} \
    --region ${REGION} \
    --query 'Configuration.LastModified' \
    --output text 2>/dev/null)
  echo "   🕐 Last Modified: ${LAST_MODIFIED}"

  # Check Lambda environment variables
  echo ""
  echo "   Environment Variables:"
  aws lambda get-function-configuration \
    --function-name ${LAMBDA_NAME} \
    --region ${REGION} \
    --query 'Environment.Variables' \
    --output json 2>/dev/null | jq -r 'keys[]' | while read key; do
    echo "      - $key"
  done
fi

# 5. Test API directly
echo ""
echo "5️⃣  Testing API Endpoints:"

# Test health endpoint
echo "   Testing ${API_URL}/health"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/health" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Health check: OK (200)"
  echo "   Response: $BODY"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "   ❌ Health check: Forbidden (403)"
  echo "   This means API Gateway is working but Lambda is not connected"
elif [ "$HTTP_CODE" = "000" ]; then
  echo "   ❌ Health check: Connection failed"
  echo "   Network or DNS issue"
else
  echo "   ❌ Health check: Failed ($HTTP_CODE)"
  echo "   Response: $BODY"
fi

# Test with CORS headers
echo ""
echo "   Testing with CORS preflight (OPTIONS):"
PREFLIGHT=$(curl -s -X OPTIONS \
  -H "Origin: https://dev.complens.ai" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -i "${API_URL}/chat" 2>/dev/null || echo "FAILED")

if echo "$PREFLIGHT" | grep -q "Access-Control-Allow-Origin"; then
  echo "   ✅ CORS preflight: Passes"
  echo "$PREFLIGHT" | grep "Access-Control"
else
  echo "   ❌ CORS preflight: FAILED"
  echo "   No Access-Control headers in response"
fi

# 6. Check CloudWatch Logs
echo ""
echo "6️⃣  Recent Lambda Logs (if exists):"
if ! echo "$LAMBDA_EXISTS" | grep -q "ResourceNotFoundException"; then
  LOG_GROUP="/aws/lambda/${LAMBDA_NAME}"

  RECENT_LOGS=$(aws logs tail ${LOG_GROUP} \
    --since 10m \
    --format short \
    --region ${REGION} 2>/dev/null | head -20)

  if [ -n "$RECENT_LOGS" ]; then
    echo "$RECENT_LOGS"
  else
    echo "   ⚠️  No recent logs (last 10 minutes)"
  fi
fi

# 7. Summary and recommendations
echo ""
echo "========================================"
echo "📋 Summary & Next Steps:"
echo ""

if echo "$LAMBDA_EXISTS" | grep -q "ResourceNotFoundException"; then
  echo "🔴 CRITICAL: Lambda function not deployed"
  echo ""
  echo "The API Gateway exists but has no Lambda backend."
  echo ""
  echo "Fix:"
  echo "  1. Uncomment the ApiLambdaFunction resource in:"
  echo "     infrastructure/cloudformation/main.yaml (around line 624)"
  echo "  2. Build and upload Lambda code:"
  echo "     cd backend/lambda/api"
  echo "     npm install"
  echo "     npm run build"
  echo "     npm run deploy"
  echo "  3. Update CloudFormation stack:"
  echo "     cd infrastructure/cloudformation"
  echo "     ./deploy.sh dev"
  echo ""
elif [ "$HTTP_CODE" != "200" ]; then
  echo "🟠 Lambda exists but not responding correctly"
  echo ""
  echo "Check:"
  echo "  1. Lambda logs: aws logs tail /aws/lambda/${LAMBDA_NAME} --follow"
  echo "  2. VPC configuration (ENI might be creating)"
  echo "  3. Database connectivity"
  echo ""
elif ! echo "$CORS" | jq -r '.AllowOrigins[]' | grep -q "dev.complens.ai"; then
  echo "🟡 API works but CORS not configured"
  echo ""
  echo "Fix:"
  echo "  ./scripts/fix-cors.sh"
  echo ""
else
  echo "🟢 Everything looks good!"
  echo ""
  echo "If frontend still has issues:"
  echo "  1. Clear browser cache"
  echo "  2. Check browser console for exact error"
  echo "  3. Check Network tab for request/response headers"
fi

echo "========================================"
