#!/bin/bash
# ============================================================================
# Fix Organizations Table - Add Missing Columns
# ============================================================================
# Run this on the bastion to add missing columns to organizations table
# ============================================================================

set -e

echo "============================================"
echo "Fix Organizations Table"
echo "============================================"
echo "This will add missing columns if they don't exist:"
echo "  - tier"
echo "  - max_users"
echo "  - max_conversations_per_month"
echo "  - features"
echo ""
read -p "Continue? (y/n): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Fetching database credentials..."

# Get database credentials from Secrets Manager
SECRET_ARN="${ApplicationSecrets}"
REGION="${AWS::Region}"

if [ -z "$SECRET_ARN" ]; then
    # Try to get from CloudFormation
    SECRET_ARN=$(aws cloudformation describe-stacks \
        --stack-name complens-dev \
        --region us-east-1 \
        --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
        --output text 2>/dev/null || echo "")
fi

if [ -z "$SECRET_ARN" ]; then
    SECRET_ARN="dev/complens/app-secrets"
fi

SECRET_JSON=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ARN" \
    --region ${REGION:-us-east-1} \
    --query SecretString \
    --output text)

DB_HOST=$(echo "$SECRET_JSON" | jq -r '.dbHost')
DB_PORT=$(echo "$SECRET_JSON" | jq -r '.dbPort')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbName')
DB_USER=$(echo "$SECRET_JSON" | jq -r '.dbUsername')
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.dbPassword')

echo "Connected to: $DB_NAME at $DB_HOST:$DB_PORT"
echo ""

# Create SQL file
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Check current structure
\echo '============================================'
\echo 'Current organizations table structure:'
\echo '============================================'
\d organizations
\echo ''

-- Add missing columns
DO $$
BEGIN
    -- Add tier column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'tier'
    ) THEN
        ALTER TABLE organizations ADD COLUMN tier TEXT DEFAULT 'free';
        RAISE NOTICE '✅ Added tier column';
    ELSE
        RAISE NOTICE '⏭️  tier column already exists';
    END IF;

    -- Add max_users column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_users'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_users INTEGER DEFAULT 10;
        RAISE NOTICE '✅ Added max_users column';
    ELSE
        RAISE NOTICE '⏭️  max_users column already exists';
    END IF;

    -- Add max_conversations_per_month column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_conversations_per_month'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_conversations_per_month INTEGER DEFAULT 1000;
        RAISE NOTICE '✅ Added max_conversations_per_month column';
    ELSE
        RAISE NOTICE '⏭️  max_conversations_per_month column already exists';
    END IF;

    -- Add features column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'features'
    ) THEN
        ALTER TABLE organizations ADD COLUMN features JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE '✅ Added features column';
    ELSE
        RAISE NOTICE '⏭️  features column already exists';
    END IF;
END $$;

\echo ''
\echo '============================================'
\echo 'Updated organizations table structure:'
\echo '============================================'
\d organizations

\echo ''
\echo '============================================'
\echo 'Current organizations:'
\echo '============================================'
SELECT id, name, domain, tier, max_users, max_conversations_per_month FROM organizations;

\echo ''
\echo '✅ Organizations table is ready!'
EOF

echo "Running SQL..."
echo ""

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$SQL_FILE"

# Cleanup
rm -f "$SQL_FILE"

echo ""
echo "============================================"
echo "✅ Done!"
echo "============================================"
echo "The organizations table now has all required columns."
echo "You can now run the setup-owner script."
echo ""
