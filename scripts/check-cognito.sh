#!/bin/bash
# Debug script to check Cognito configuration
# Usage: ./scripts/check-cognito.sh [stage]

STAGE="${1:-dev}"
STACK_NAME="complens-${STAGE}"

echo "Checking Cognito configuration for stack: ${STACK_NAME}"
echo "=================================================="
echo ""

# Check if AWS CLI works
echo "1. Testing AWS CLI..."
if ! aws sts get-caller-identity &>/dev/null; then
    echo "   ERROR: AWS CLI not configured or no credentials"
    exit 1
fi
echo "   OK - AWS CLI working"
echo ""

# Check if stack exists
echo "2. Checking if stack exists..."
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query "Stacks[0].StackStatus" --output text 2>/dev/null)
if [ -z "$STACK_STATUS" ]; then
    echo "   ERROR: Stack '${STACK_NAME}' not found!"
    echo "   Run: sam deploy --config-env ${STAGE}"
    exit 1
fi
echo "   OK - Stack status: ${STACK_STATUS}"
echo ""

# Get Cognito values
echo "3. Fetching Cognito configuration..."
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
API_URL=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query "Stacks[0].Outputs[?OutputKey=='RestApiCustomUrl'].OutputValue" --output text)

echo "   USER_POOL_ID: ${USER_POOL_ID:-EMPTY}"
echo "   CLIENT_ID:    ${CLIENT_ID:-EMPTY}"
echo "   API_URL:      ${API_URL:-EMPTY}"
echo ""

# Validate
if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
    echo "ERROR: USER_POOL_ID is empty or None!"
    exit 1
fi

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
    echo "ERROR: CLIENT_ID is empty or None!"
    exit 1
fi

echo "4. Creating web/.env.local..."
cat > web/.env.local << EOF
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${CLIENT_ID}
VITE_API_URL=${API_URL}
EOF

echo "   Created web/.env.local:"
echo "   ----------------------"
cat web/.env.local
echo ""

echo "5. Now run these commands to rebuild and deploy:"
echo "   cd web && npm run build && cd .."
echo "   make web-deploy STAGE=${STAGE}"
echo ""
echo "Done!"
