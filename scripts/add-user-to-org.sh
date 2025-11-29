#!/bin/bash
# ============================================================================
# Add User to Existing Organization (or Update Role)
# ============================================================================
# Use this when:
# - Organization already exists
# - You need to add your Cognito user to it
# - You need to update your role to owner
# ============================================================================

set -e

echo "============================================"
echo "Add/Update User in Organization"
echo "============================================"
echo ""
echo "This script will:"
echo "1. Find your existing organization (or create if missing)"
echo "2. Add you to it as owner (or update your role)"
echo ""
read -p "Continue? (y/n): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Enter the following information:"
echo ""
read -p "Cognito User ID (sub): " COGNITO_SUB
read -p "Email address: " USER_EMAIL
read -p "Full name: " USER_NAME
read -p "Organization domain (from your email, e.g., itsross.com): " ORG_DOMAIN

echo ""
echo "============================================"
echo "Configuration:"
echo "============================================"
echo "Cognito Sub: $COGNITO_SUB"
echo "Email: $USER_EMAIL"
echo "Name: $USER_NAME"
echo "Domain: $ORG_DOMAIN"
echo ""
read -p "Proceed? (y/n): " CONFIRM2

if [[ ! "$CONFIRM2" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Fetching database credentials..."

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

echo "Connected to: $DB_NAME at $DB_HOST:$DB_PORT"
echo ""

# Create SQL file
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << EOF
\echo '============================================'
\echo 'Finding or Creating Organization'
\echo '============================================'
\echo ''

DO \$\$
DECLARE
    v_org_id UUID;
    v_user_org_exists BOOLEAN;
    v_current_role TEXT;
BEGIN
    -- Find existing organization by domain
    SELECT id INTO v_org_id
    FROM organizations
    WHERE domain = '$ORG_DOMAIN'
    LIMIT 1;

    IF v_org_id IS NULL THEN
        -- Organization doesn't exist, create it
        RAISE NOTICE 'Organization not found for domain: $ORG_DOMAIN';
        RAISE NOTICE 'Creating new organization...';

        INSERT INTO organizations (
            name, domain, tier, max_users,
            max_conversations_per_month, features
        )
        VALUES (
            '$ORG_DOMAIN Organization',
            '$ORG_DOMAIN',
            'free',
            10,
            1000,
            '{"api_access": true, "advanced_security": true}'::jsonb
        )
        RETURNING id INTO v_org_id;

        RAISE NOTICE '✅ Created organization (ID: %)', v_org_id;
    ELSE
        RAISE NOTICE '✅ Found existing organization (ID: %)', v_org_id;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Adding/Updating User';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';

    -- Check if user already has a mapping to this org
    SELECT EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_id = '$COGNITO_SUB' AND org_id = v_org_id
    ) INTO v_user_org_exists;

    IF v_user_org_exists THEN
        -- User exists, get current role
        SELECT role INTO v_current_role
        FROM user_organizations
        WHERE user_id = '$COGNITO_SUB' AND org_id = v_org_id;

        RAISE NOTICE 'User already in organization with role: %', v_current_role;

        -- Update to owner and primary
        UPDATE user_organizations
        SET
            role = 'owner',
            is_primary = true,
            metadata = jsonb_build_object(
                'email', '$USER_EMAIL',
                'name', '$USER_NAME',
                'updated_at', NOW()
            )
        WHERE user_id = '$COGNITO_SUB' AND org_id = v_org_id;

        RAISE NOTICE '✅ Updated user role to: owner';
        RAISE NOTICE '✅ Set as primary organization';
    ELSE
        -- User doesn't exist, create mapping
        RAISE NOTICE 'User not in organization, adding as owner...';

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
                'created_at', NOW()
            )
        );

        RAISE NOTICE '✅ Added user as owner';
    END IF;
END \$\$;

\echo ''
\echo '============================================'
\echo 'Final Status'
\echo '============================================'
\echo ''

-- Show all user's organizations
SELECT
    '✅ SUCCESS' as status,
    uo.user_id,
    uo.role,
    uo.is_primary,
    o.name as organization_name,
    o.domain,
    o.tier,
    uo.metadata->>'email' as email
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = '$COGNITO_SUB'
ORDER BY uo.is_primary DESC, uo.created_at;

-- Final check
SELECT CASE
    WHEN EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_id = '$COGNITO_SUB' AND role = 'owner'
    )
    THEN '✅ You are now an organization owner!'
    WHEN EXISTS (
        SELECT 1 FROM user_organizations
        WHERE user_id = '$COGNITO_SUB'
    )
    THEN '⚠️  User exists but role is not owner. Check above.'
    ELSE '❌ ERROR: User still not found.'
END as final_status;
EOF

echo "============================================"
echo "Running Update..."
echo "============================================"
echo ""

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "$SQL_FILE"

PSQL_EXIT_CODE=\$?

# Cleanup
rm -f "$SQL_FILE"

echo ""
echo "============================================"

if [ \$PSQL_EXIT_CODE -eq 0 ]; then
    echo "✅ SETUP COMPLETE!"
    echo "============================================"
    echo ""
    echo "Your Cognito user is now linked to the organization!"
    echo ""
    echo "Next steps:"
    echo "1. Refresh your browser (or log out and back in)"
    echo "2. Go to https://dev.complens.ai/admin"
    echo "3. You should now have full admin access!"
    echo ""
else
    echo "❌ UPDATE FAILED"
    echo "============================================"
    echo ""
    echo "Check the errors above."
    exit 1
fi
