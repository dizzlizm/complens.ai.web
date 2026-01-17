#!/bin/bash

# Complens.ai Secrets Manager Update Script
# Adds Google OAuth credentials to the application secret
#
# Usage:
#   ./scripts/update-secrets.sh [environment]
#
# Examples:
#   ./scripts/update-secrets.sh           # Updates dev environment
#   ./scripts/update-secrets.sh prod      # Updates prod environment
#
# The script will prompt for the Google OAuth credentials

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-dev}
REGION=${AWS_REGION:-us-east-1}
STACK_NAME="complens-${ENVIRONMENT}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Complens.ai Secrets Manager Update${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Stack: ${YELLOW}${STACK_NAME}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo ""

# Check prerequisites
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed${NC}"
    echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Get Secrets ARN from CloudFormation
echo -e "${BLUE}Fetching Secrets ARN from CloudFormation...${NC}"

SECRETS_ARN=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
    --output text \
    --region ${REGION} 2>/dev/null)

if [ -z "$SECRETS_ARN" ] || [ "$SECRETS_ARN" = "None" ]; then
    echo -e "${RED}Error: Could not find SecretsArn in stack outputs${NC}"
    echo "Make sure the CloudFormation stack is deployed."
    exit 1
fi

# Get CloudFront URL for redirect URI
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
    --output text \
    --region ${REGION} 2>/dev/null)

echo -e "${GREEN}✓ Stack outputs retrieved${NC}"
echo -e "  Secrets ARN: ${SECRETS_ARN}"
echo -e "  CloudFront URL: ${CLOUDFRONT_URL}"
echo ""

# Prompt for Google OAuth credentials
echo -e "${BLUE}Enter Google OAuth credentials:${NC}"
echo "(Get these from Google Cloud Console > APIs & Services > Credentials)"
echo ""

read -p "Google Client ID: " GOOGLE_CLIENT_ID
read -s -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""

if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo -e "${RED}Error: Both Client ID and Client Secret are required${NC}"
    exit 1
fi

# Calculate redirect URI
REDIRECT_URI="${CLOUDFRONT_URL}/api/oauth/google/callback"
FRONTEND_URL="${CLOUDFRONT_URL}"

echo ""
echo -e "${BLUE}Configuration summary:${NC}"
echo "  Client ID: ${GOOGLE_CLIENT_ID:0:20}..."
echo "  Redirect URI: ${REDIRECT_URI}"
echo "  Frontend URL: ${FRONTEND_URL}"
echo ""
echo -e "${YELLOW}⚠️  Make sure this redirect URI is configured in Google Cloud Console!${NC}"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Update cancelled${NC}"
    exit 1
fi

# Get current secret value
echo ""
echo -e "${BLUE}Fetching current secret...${NC}"

CURRENT_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRETS_ARN}" \
    --query SecretString \
    --output text \
    --region ${REGION})

# Merge with Google OAuth credentials
NEW_SECRET=$(echo "$CURRENT_SECRET" | jq \
    --arg cid "$GOOGLE_CLIENT_ID" \
    --arg csec "$GOOGLE_CLIENT_SECRET" \
    --arg ruri "$REDIRECT_URI" \
    --arg furl "$FRONTEND_URL" \
    '. + {
        googleClientId: $cid,
        googleClientSecret: $csec,
        googleRedirectUri: $ruri,
        frontendUrl: $furl
    }')

# Update the secret
echo -e "${BLUE}Updating secret...${NC}"

aws secretsmanager update-secret \
    --secret-id "${SECRETS_ARN}" \
    --secret-string "$NEW_SECRET" \
    --region ${REGION}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Secrets updated successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "The following keys were added/updated in Secrets Manager:"
echo "  - googleClientId"
echo "  - googleClientSecret"
echo "  - googleRedirectUri"
echo "  - frontendUrl"
echo ""
echo -e "${YELLOW}Important: Add this redirect URI to Google Cloud Console:${NC}"
echo "  ${REDIRECT_URI}"
echo ""
echo "Next steps:"
echo "  1. Configure the redirect URI in Google Cloud Console"
echo "  2. Enable the required Google APIs (Admin SDK, Drive API)"
echo "  3. Deploy your Lambda functions to pick up the new secrets"
echo ""

# ============================================================================
# MANUAL AWS CLI SYNTAX (for reference)
# ============================================================================
#
# To manually update Secrets Manager, use one of these methods:
#
# METHOD 1: Using update-secret with merged JSON
# -----------------------------------------------
# # Get current secret
# CURRENT=$(aws secretsmanager get-secret-value --secret-id <SECRET_ARN> --query SecretString --output text)
#
# # Merge with new values (requires jq)
# NEW=$(echo "$CURRENT" | jq '. + {googleClientId: "your-id", googleClientSecret: "your-secret"}')
#
# # Update
# aws secretsmanager update-secret --secret-id <SECRET_ARN> --secret-string "$NEW"
#
#
# METHOD 2: Using put-secret-value with full JSON
# ------------------------------------------------
# aws secretsmanager put-secret-value \
#   --secret-id <SECRET_ARN> \
#   --secret-string '{
#     "dbHost": "...",
#     "dbPort": "5432",
#     "dbName": "complens",
#     "dbUsername": "postgres",
#     "dbPassword": "...",
#     "googleClientId": "your-client-id.apps.googleusercontent.com",
#     "googleClientSecret": "GOCSPX-your-secret",
#     "googleRedirectUri": "https://your-cloudfront.net/api/oauth/google/callback",
#     "frontendUrl": "https://your-cloudfront.net"
#   }'
#
#
# METHOD 3: Using AWS Console
# ---------------------------
# 1. Go to AWS Console > Secrets Manager
# 2. Find the secret: complens-<env>-secrets
# 3. Click "Retrieve secret value"
# 4. Click "Edit"
# 5. Add the following keys:
#    - googleClientId: Your OAuth Client ID
#    - googleClientSecret: Your OAuth Client Secret
#    - googleRedirectUri: https://your-cloudfront.net/api/oauth/google/callback
#    - frontendUrl: https://your-cloudfront.net
# 6. Click "Save"
#
# ============================================================================
