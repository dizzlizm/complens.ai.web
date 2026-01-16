#!/bin/bash

# Complens.ai Database Migration Script
# Applies SQL migrations to the RDS PostgreSQL database
#
# Usage:
#   ./scripts/apply-migration.sh <migration-file> [environment]
#
# Examples:
#   ./scripts/apply-migration.sh 005_add_findings_unique_constraint.sql
#   ./scripts/apply-migration.sh 005_add_findings_unique_constraint.sql prod
#
# Prerequisites:
#   - AWS CLI installed and configured
#   - jq installed (for JSON parsing)
#   - psql installed (PostgreSQL client)
#   - Network access to RDS (VPN, bastion, or public access)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MIGRATION_FILE=$1
ENVIRONMENT=${2:-dev}
REGION=${AWS_REGION:-us-east-1}
STACK_NAME="complens-${ENVIRONMENT}"

# Validate arguments
if [ -z "$MIGRATION_FILE" ]; then
    echo -e "${RED}Error: Migration file required${NC}"
    echo ""
    echo "Usage: $0 <migration-file> [environment]"
    echo ""
    echo "Examples:"
    echo "  $0 005_add_findings_unique_constraint.sql"
    echo "  $0 005_add_findings_unique_constraint.sql prod"
    echo ""
    echo "Available migrations:"
    ls -1 backend/database/migrations/*.sql 2>/dev/null || echo "  No migrations found in backend/database/migrations/"
    exit 1
fi

# Find the migration file
if [ -f "$MIGRATION_FILE" ]; then
    MIGRATION_PATH="$MIGRATION_FILE"
elif [ -f "backend/database/migrations/$MIGRATION_FILE" ]; then
    MIGRATION_PATH="backend/database/migrations/$MIGRATION_FILE"
else
    echo -e "${RED}Error: Migration file not found: ${MIGRATION_FILE}${NC}"
    echo ""
    echo "Available migrations:"
    ls -1 backend/database/migrations/*.sql 2>/dev/null || echo "  No migrations found"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Complens.ai Database Migration${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Migration: ${YELLOW}${MIGRATION_PATH}${NC}"
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

if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql is required but not installed${NC}"
    echo "Install PostgreSQL client: brew install postgresql (macOS) or apt-get install postgresql-client (Linux)"
    exit 1
fi

# Get database credentials from Secrets Manager
echo -e "${BLUE}Fetching database credentials from Secrets Manager...${NC}"

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

SECRETS=$(aws secretsmanager get-secret-value \
    --secret-id "${SECRETS_ARN}" \
    --query SecretString \
    --output text \
    --region ${REGION})

DB_HOST=$(echo "$SECRETS" | jq -r '.dbHost')
DB_PORT=$(echo "$SECRETS" | jq -r '.dbPort')
DB_NAME=$(echo "$SECRETS" | jq -r '.dbName')
DB_USER=$(echo "$SECRETS" | jq -r '.dbUsername')
DB_PASS=$(echo "$SECRETS" | jq -r '.dbPassword')

if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "null" ]; then
    echo -e "${RED}Error: Could not parse database credentials${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Credentials retrieved${NC}"
echo -e "  Host: ${DB_HOST}"
echo -e "  Port: ${DB_PORT}"
echo -e "  Database: ${DB_NAME}"
echo -e "  User: ${DB_USER}"
echo ""

# Read the migration file
MIGRATION_SQL=$(cat "$MIGRATION_PATH")

echo -e "${BLUE}Migration SQL:${NC}"
echo "----------------------------------------"
cat "$MIGRATION_PATH"
echo "----------------------------------------"
echo ""

# Confirm before applying
echo -e "${YELLOW}⚠️  This will modify the ${ENVIRONMENT} database!${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Migration cancelled${NC}"
    exit 1
fi

# Apply migration
echo ""
echo -e "${BLUE}Applying migration...${NC}"

export PGPASSWORD="$DB_PASS"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_PATH"

RESULT=$?
unset PGPASSWORD

if [ $RESULT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ Migration applied successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify the changes: psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c '\d findings'"
    echo "  2. Deploy your Lambda functions"
    echo "  3. Test the security scanner"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Migration failed!${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
