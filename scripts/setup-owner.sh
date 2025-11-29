#!/bin/bash
# ============================================================================
# Setup Organization Owner
# ============================================================================
# Run this on the bastion to create your organization and set yourself as owner
# ============================================================================

set -e

echo "============================================"
echo "Setup Organization Owner"
echo "============================================"
echo ""
echo "This script will:"
echo "1. Create your organization"
echo "2. Add you as the owner"
echo ""
echo "You'll need your Cognito User ID (sub)."
echo "Get it from: AWS Console > Cognito > User Pools > dev-complens-users > Users"
echo "Click your user and copy the 'Username' field."
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
read -p "Organization name: " ORG_NAME

# Extract domain from email
DOMAIN=$(echo "$USER_EMAIL" | cut -d'@' -f2)

echo ""
echo "============================================"
echo "Configuration:"
echo "============================================"
echo "Cognito Sub: $COGNITO_SUB"
echo "Email: $USER_EMAIL"
echo "Name: $USER_NAME"
echo "Organization: $ORG_NAME"
echo "Domain: $DOMAIN"
echo ""
read -p "Proceed? (y/n): " CONFIRM2

if [[ ! "$CONFIRM2" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Fetching database credentials..."

# Get database credentials from Secrets Manager
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
DO \$\$
DECLARE
    v_org_id UUID;
    v_existing_count INTEGER;
    v_has_tier BOOLEAN;
    v_has_max_users BOOLEAN;
    v_has_features BOOLEAN;
    v_has_max_conversations BOOLEAN;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Setting up organization owner';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'User: $USER_EMAIL';
    RAISE NOTICE 'Org: $ORG_NAME';
    RAISE NOTICE '';

    -- Check if user already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM user_organizations
    WHERE user_id = '$COGNITO_SUB';

    IF v_existing_count > 0 THEN
        RAISE NOTICE '⚠️  User already has an organization!';
        RAISE NOTICE '';
        RETURN;
    END IF;

    -- Check which columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'tier'
    ) INTO v_has_tier;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_users'
    ) INTO v_has_max_users;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'features'
    ) INTO v_has_features;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_conversations_per_month'
    ) INTO v_has_max_conversations;

    -- Create organization with available columns
    IF v_has_tier AND v_has_max_users AND v_has_features AND v_has_max_conversations THEN
        RAISE NOTICE 'Creating organization with all columns...';
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
    ELSE
        RAISE NOTICE 'Creating organization with basic columns...';
        RAISE NOTICE 'Run fix-organizations-table.sh to add missing columns';
        INSERT INTO organizations (name, domain)
        VALUES ('$ORG_NAME', '$DOMAIN')
        RETURNING id INTO v_org_id;
    END IF;

    RAISE NOTICE '✅ Created organization: $ORG_NAME (ID: %)', v_org_id;

    -- Create user-organization mapping
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
            'name', '$USER_NAME'
        )
    );

    RAISE NOTICE '✅ Added user as owner';
    RAISE NOTICE '============================================';
END \$\$;

-- Verify results
\echo ''
\echo '============================================'
\echo 'Verification:'
\echo '============================================'
SELECT
    '✅ SUCCESS' as status,
    uo.role,
    o.name as organization,
    o.domain,
    uo.metadata->>'email' as email
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = '$COGNITO_SUB';

-- Check if user exists
SELECT CASE
    WHEN EXISTS (SELECT 1 FROM user_organizations WHERE user_id = '$COGNITO_SUB')
    THEN '✅ Setup complete! You can now access the admin page.'
    ELSE '❌ ERROR: Something went wrong. User not found.'
END as result;
EOF

echo "============================================"
echo "Running SQL..."
echo "============================================"
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
echo ""
echo "Next steps:"
echo "1. Refresh your browser"
echo "2. Go to the admin page at https://dev.complens.ai/admin"
echo "3. You should now have full access!"
echo ""
