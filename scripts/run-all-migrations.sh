#!/bin/bash
# Run ALL database migrations in order
# This script will run migrations 002, 003, and 004

set -e

echo "==================================================="
echo "Database Migration Runner"
echo "==================================================="
echo ""
echo "This will run ALL migrations in order:"
echo "  002_create_security_tables.sql"
echo "  003_create_admin_users.sql"
echo "  004_multi_tenant_isolation.sql"
echo ""

# Configuration
STACK_NAME="complens-dev"
AWS_REGION="us-east-1"

echo "Getting database credentials from AWS..."
echo ""

# Get RDS endpoint
echo "1. Getting RDS endpoint..."
RDS_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${AWS_REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseEndpoint`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$RDS_ENDPOINT" ]; then
  echo "❌ Could not find RDS endpoint. Trying alternate output key..."
  # Try alternate output names
  RDS_ENDPOINT=$(aws rds describe-db-instances \
    --region ${AWS_REGION} \
    --query 'DBInstances[?contains(DBInstanceIdentifier, `complens`)].Endpoint.Address | [0]' \
    --output text 2>/dev/null || echo "")
fi

if [ -z "$RDS_ENDPOINT" ] || [ "$RDS_ENDPOINT" == "None" ]; then
  echo "❌ ERROR: Could not find RDS endpoint!"
  echo ""
  echo "Please provide RDS endpoint manually:"
  echo "You can find it in AWS Console → RDS → Databases → complens-dev"
  echo ""
  read -p "Enter RDS endpoint: " RDS_ENDPOINT
fi

echo "✅ RDS: $RDS_ENDPOINT"
echo ""

# Get secrets
echo "2. Getting database credentials from Secrets Manager..."
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${AWS_REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  # Try to find secret by name
  SECRET_ARN=$(aws secretsmanager list-secrets \
    --region ${AWS_REGION} \
    --query "SecretList[?contains(Name, 'complens')].ARN | [0]" \
    --output text 2>/dev/null || echo "")
fi

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  echo "❌ Could not find Secrets Manager ARN"
  echo "Please enter credentials manually:"
  read -p "Database name (default: complens): " DB_NAME
  DB_NAME=${DB_NAME:-complens}
  read -p "Database user (default: postgres): " DB_USER
  DB_USER=${DB_USER:-postgres}
  read -sp "Database password: " DB_PASSWORD
  echo ""
else
  echo "✅ Found secret: $SECRET_ARN"

  DB_NAME=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRET_ARN}" \
    --region ${AWS_REGION} \
    --query SecretString \
    --output text 2>/dev/null | jq -r '.dbName // "complens"')

  DB_USER=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRET_ARN}" \
    --region ${AWS_REGION} \
    --query SecretString \
    --output text 2>/dev/null | jq -r '.dbUsername // "postgres"')

  DB_PASSWORD=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRET_ARN}" \
    --region ${AWS_REGION} \
    --query SecretString \
    --output text 2>/dev/null | jq -r '.dbPassword')
fi

echo "✅ Database: $DB_NAME"
echo "✅ User: $DB_USER"
echo ""

# Test connection
echo "3. Testing database connection..."
if PGPASSWORD="${DB_PASSWORD}" psql -h "${RDS_ENDPOINT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
  echo "✅ Connection successful!"
else
  echo "❌ ERROR: Cannot connect to database!"
  echo ""
  echo "Possible issues:"
  echo "1. RDS is in a private subnet (no direct internet access)"
  echo "2. Security group doesn't allow your IP"
  echo "3. Wrong credentials"
  echo ""
  echo "Solutions:"
  echo "A. Update RDS security group to allow your IP:"
  echo "   aws ec2 authorize-security-group-ingress \\"
  echo "     --group-id YOUR_SECURITY_GROUP_ID \\"
  echo "     --protocol tcp --port 5432 \\"
  echo "     --cidr YOUR_IP/32"
  echo ""
  echo "B. Use AWS Session Manager port forwarding (see README)"
  echo ""
  echo "C. Connect from an EC2 instance in the same VPC"
  echo ""
  exit 1
fi

echo ""
echo "==================================================="
echo "Running migrations..."
echo "==================================================="
echo ""

# Change to migrations directory
cd "$(dirname "$0")/../backend/database/migrations"

# Run each migration
for migration in 002_create_security_tables.sql 003_create_admin_users.sql 004_multi_tenant_isolation.sql; do
  if [ -f "$migration" ]; then
    echo "Running $migration..."
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${RDS_ENDPOINT}" -U "${DB_USER}" -d "${DB_NAME}" -f "$migration"; then
      echo "✅ $migration completed"
    else
      echo "❌ $migration failed!"
      exit 1
    fi
    echo ""
  else
    echo "⚠️  Warning: $migration not found, skipping..."
  fi
done

echo "==================================================="
echo "✅ All migrations completed successfully!"
echo "==================================================="
echo ""
echo "Verifying tables..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${RDS_ENDPOINT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name;
"

echo ""
echo "Next steps:"
echo "1. Deploy your backend: cd backend && sam build && sam deploy"
echo "2. Clear browser cache and log in"
echo "3. Your org will auto-provision on first chat!"
echo ""
