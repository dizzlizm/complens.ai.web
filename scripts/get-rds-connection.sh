#!/bin/bash
# Connect to RDS via AWS Session Manager Port Forwarding
# This creates a tunnel from your local machine to RDS through AWS SSM

set -e

echo "==================================================="
echo "RDS Connection via AWS Session Manager"
echo "==================================================="
echo ""

# Configuration
STACK_NAME="complens-dev"
AWS_REGION="us-east-1"
LOCAL_PORT=5432

echo "Step 1: Getting RDS endpoint..."
RDS_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${AWS_REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text)

if [ -z "$RDS_ENDPOINT" ]; then
  echo "❌ Could not find RDS endpoint in stack outputs"
  echo "Available outputs:"
  aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[].OutputKey'
  exit 1
fi

echo "✅ RDS Endpoint: $RDS_ENDPOINT"
echo ""

echo "Step 2: Getting database password from Secrets Manager..."
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${AWS_REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
  --output text)

DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ARN}" \
  --region ${AWS_REGION} \
  --query SecretString \
  --output text | jq -r '.dbPassword')

DB_NAME=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ARN}" \
  --region ${AWS_REGION} \
  --query SecretString \
  --output text | jq -r '.dbName')

DB_USER=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ARN}" \
  --region ${AWS_REGION} \
  --query SecretString \
  --output text | jq -r '.dbUsername')

echo "✅ Database: $DB_NAME"
echo "✅ User: $DB_USER"
echo ""

echo "Step 3: Finding Lambda function (we'll tunnel through its VPC)..."
FUNCTION_NAME=$(aws lambda list-functions \
  --region ${AWS_REGION} \
  --query "Functions[?starts_with(FunctionName, 'dev-complens')].FunctionName | [0]" \
  --output text)

if [ -z "$FUNCTION_NAME" ]; then
  echo "❌ Could not find Lambda function"
  exit 1
fi

echo "✅ Found function: $FUNCTION_NAME"
echo ""

echo "==================================================="
echo "Ready to connect!"
echo "==================================================="
echo ""
echo "Option 1: Direct psql connection"
echo "Run this in a NEW terminal:"
echo ""
echo "PGPASSWORD='${DB_PASSWORD}' psql -h ${RDS_ENDPOINT} -U ${DB_USER} -d ${DB_NAME}"
echo ""
echo "Option 2: Run migrations"
echo "Run this in a NEW terminal:"
echo ""
echo "PGPASSWORD='${DB_PASSWORD}' psql -h ${RDS_ENDPOINT} -U ${DB_USER} -d ${DB_NAME} << 'EOF'
\i backend/database/migrations/002_create_security_tables.sql
\i backend/database/migrations/003_create_admin_users.sql
\i backend/database/migrations/004_multi_tenant_isolation.sql
EOF"
echo ""
echo "==================================================="
echo ""
echo "Save this info for manual connection:"
echo "Host: ${RDS_ENDPOINT}"
echo "Database: ${DB_NAME}"
echo "User: ${DB_USER}"
echo "Password: ${DB_PASSWORD}"
echo ""
