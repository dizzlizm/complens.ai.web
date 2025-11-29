#!/bin/bash
# ============================================================================
# Setup First Admin User - Complete Setup
# ============================================================================
# This script does EVERYTHING needed to set up the first admin user:
# 1. Fixes the organizations table (adds missing columns)
# 2. Creates your organization
# 3. Adds you as the owner
#
# Just run this ONE script and you're done!
# ============================================================================

set -e

echo "============================================"
echo "Complete First Admin Setup"
echo "============================================"
echo ""
echo "This script will:"
echo "1. Fix the organizations table (add missing columns)"
echo "2. Create your organization"
echo "3. Add you as the owner with full admin access"
echo ""
echo "You'll need your Cognito User ID (sub)."
echo ""
echo "📝 How to get your Cognito User ID:"
echo "   AWS Console > Cognito > User Pools > dev-complens-users > Users"
echo "   Click your user and copy the 'Username' field"
echo "   (looks like: 12345678-1234-1234-1234-123456789abc)"
echo ""
read -p "Continue? (y/n): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "============================================"
echo "User Information"
echo "============================================"
echo ""
read -p "Cognito User ID (sub): " COGNITO_SUB
read -p "Email address: " USER_EMAIL
read -p "Full name: " USER_NAME
read -p "Organization name: " ORG_NAME

# Extract domain from email
DOMAIN=$(echo "$USER_EMAIL" | cut -d'@' -f2)

echo ""
echo "============================================"
echo "Configuration Summary"
echo "============================================"
echo "Cognito Sub: $COGNITO_SUB"
echo "Email: $USER_EMAIL"
echo "Name: $USER_NAME"
echo "Organization: $ORG_NAME"
echo "Domain: $DOMAIN"
echo ""
read -p "Is this correct? (y/n): " CONFIRM2

if [[ ! "$CONFIRM2" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "============================================"
echo "Step 1: Connecting to Database"
echo "============================================"
echo ""
echo "Fetching credentials from Secrets Manager..."

# Get database credentials
SECRET_ARN="${ApplicationSecrets}"
REGION="${AWS::Region}"

if [ -z "$SECRET_ARN" ]; then
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

echo "✅ Connected to: $DB_NAME at $DB_HOST:$DB_PORT"
echo ""

# Create combined SQL file
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << EOF
\echo '============================================'
\echo 'Step 2: Fixing Organizations Table'
\echo '============================================'
\echo ''

-- Add missing columns to organizations table
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'tier'
    ) THEN
        ALTER TABLE organizations ADD COLUMN tier TEXT DEFAULT 'free';
        RAISE NOTICE '✅ Added tier column';
    ELSE
        RAISE NOTICE '⏭️  tier already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_users'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_users INTEGER DEFAULT 10;
        RAISE NOTICE '✅ Added max_users column';
    ELSE
        RAISE NOTICE '⏭️  max_users already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_conversations_per_month'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_conversations_per_month INTEGER DEFAULT 1000;
        RAISE NOTICE '✅ Added max_conversations_per_month column';
    ELSE
        RAISE NOTICE '⏭️  max_conversations_per_month already exists';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'features'
    ) THEN
        ALTER TABLE organizations ADD COLUMN features JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE '✅ Added features column';
    ELSE
        RAISE NOTICE '⏭️  features already exists';
    END IF;
END \$\$;

\echo ''
\echo '============================================'
\echo 'Step 3: Creating Organization and Owner'
\echo '============================================'
\echo ''

DO \$\$
DECLARE
    v_org_id UUID;
    v_existing_count INTEGER;
BEGIN
    -- Check if user already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM user_organizations
    WHERE user_id = '$COGNITO_SUB';

    IF v_existing_count > 0 THEN
        RAISE NOTICE '⚠️  User already exists in an organization!';
        RAISE NOTICE 'Skipping organization creation.';
        RAISE NOTICE '';
    ELSE
        -- Create organization
        INSERT INTO organizations (
            name, domain, tier, max_users,
            max_conversations_per_month, features
        )
        VALUES (
            '$ORG_NAME',
            '$DOMAIN',
            'free',
            10,
            1000,
            '{"api_access": true, "advanced_security": true}'::jsonb
        )
        RETURNING id INTO v_org_id;

        RAISE NOTICE '✅ Created organization: $ORG_NAME';
        RAISE NOTICE '   Organization ID: %', v_org_id;
        RAISE NOTICE '';

        -- Create user-organization mapping as owner
        INSERT INTO user_organizations (
            user_id, org_id, role, auth_provider, is_primary, metadata
        )
        VALUES (
            '$COGNITO_SUB',
            v_org_id,
            'owner',
            'cognito',
            true,
            jsonb_build_object(
                'email', '$USER_EMAIL',
                'name', '$USER_NAME',
                'setup_date', NOW()
            )
        );

        RAISE NOTICE '✅ Added you as organization owner';
        RAISE NOTICE '';
    END IF;
END \$\$;

\echo '============================================'
\echo 'Step 4: Verification'
\echo '============================================'
\echo ''

-- Show final status
SELECT
    '✅ SUCCESS' as status,
    uo.role,
    o.name as organization,
    o.domain,
    o.tier,
    o.max_users,
    uo.metadata->>'email' as email,
    uo.is_primary as is_primary_org
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = '$COGNITO_SUB';

-- Final message
SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_id = '$COGNITO_SUB' AND role = 'owner'
    )
    THEN '✅ Setup complete! You are now an organization owner with full admin access.'
    WHEN EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_id = '$COGNITO_SUB'
    )
    THEN '⚠️  User exists but is not an owner. Check the role above.'
    ELSE '❌ ERROR: User not found after setup. Something went wrong.'
END as final_status;
EOF

echo "============================================"
echo "Running Setup..."
echo "============================================"
echo ""

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$SQL_FILE"

PSQL_EXIT_CODE=$?

# Cleanup
rm -f "$SQL_FILE"

echo ""
echo "============================================"

if [ $PSQL_EXIT_CODE -eq 0 ]; then
    echo "✅ SETUP COMPLETE!"
    echo "============================================"
    echo ""
    echo "What to do next:"
    echo "1. Refresh your browser"
    echo "2. Go to https://dev.complens.ai/admin"
    echo "3. You should now have full admin access!"
    echo ""
    echo "Your role: owner"
    echo "Your organization: $ORG_NAME"
    echo ""
else
    echo "❌ SETUP FAILED"
    echo "============================================"
    echo ""
    echo "Something went wrong. Please check the errors above."
    echo ""
    exit 1
fi
