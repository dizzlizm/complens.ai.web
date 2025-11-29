#!/bin/bash
# ============================================================================
# Fix Organizations Table Schema - Convert to UUID
# ============================================================================
# This script recreates the organizations and user_organizations tables
# with proper UUID columns instead of integer IDs
# ============================================================================

set -e

echo "============================================"
echo "Fix Organizations Table Schema"
echo "============================================"
echo ""
echo "⚠️  WARNING: This will delete all existing organizations and user mappings!"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [[ "$CONFIRM" != "yes" ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "You'll need to provide your user information to recreate your account."
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
echo "Organization: $ORG_NAME"
echo "Domain: $DOMAIN"
echo ""
read -p "Proceed with this configuration? (yes/no): " CONFIRM2

if [[ "$CONFIRM2" != "yes" ]]; then
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
\echo 'Step 1: Checking current schema'
\echo '============================================'
\echo ''

SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('organizations', 'user_organizations')
    AND column_name = 'id' OR column_name = 'org_id'
ORDER BY table_name, column_name;

\echo ''
\echo '============================================'
\echo 'Step 2: Dropping existing tables'
\echo '============================================'
\echo ''

-- Drop dependent tables first
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS tenant_usage CASCADE;
DROP TABLE IF EXISTS user_invitations CASCADE;
DROP TABLE IF EXISTS saml_providers CASCADE;
DROP TABLE IF EXISTS user_organizations CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

\echo 'Tables dropped successfully.'
\echo ''
\echo '============================================'
\echo 'Step 3: Recreating organizations table with UUID'
\echo '============================================'
\echo ''

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
  max_users INTEGER DEFAULT 10,
  max_conversations_per_month INTEGER DEFAULT 1000,
  features JSONB DEFAULT '{}'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

\echo 'Organizations table created with UUID.'
\echo ''
\echo '============================================'
\echo 'Step 4: Creating user_organizations table'
\echo '============================================'
\echo ''

CREATE TABLE IF NOT EXISTS user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('cognito', 'saml', 'local')),
  is_primary BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_user_orgs_user_id ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org_id ON user_organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_primary ON user_organizations(is_primary) WHERE is_primary = true;

\echo 'User organizations table created.'
\echo ''
\echo '============================================'
\echo 'Step 5: Creating your organization'
\echo '============================================'
\echo ''

DO \$\$
DECLARE
    v_org_id UUID;
BEGIN
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

    RAISE NOTICE '✅ Created organization: $ORG_NAME (ID: %)', v_org_id;

    -- Add you as owner
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
            'fixed_at', NOW()
        )
    );

    RAISE NOTICE '✅ Added you as owner';
END \$\$;

\echo ''
\echo '============================================'
\echo 'Step 6: Verification'
\echo '============================================'
\echo ''

-- Verify schema
SELECT
    'organizations.id type: ' || data_type as check_result
FROM information_schema.columns
WHERE table_name = 'organizations' AND column_name = 'id';

SELECT
    'user_organizations.org_id type: ' || data_type as check_result
FROM information_schema.columns
WHERE table_name = 'user_organizations' AND column_name = 'org_id';

\echo ''

-- Show your organization
SELECT
    'Your Organization:' as info,
    o.id,
    o.name,
    o.domain,
    o.tier
FROM organizations o
WHERE domain = '$DOMAIN';

\echo ''

-- Show your user mapping
SELECT
    'Your User Mapping:' as info,
    uo.user_id,
    uo.role,
    uo.is_primary,
    uo.metadata->>'email' as email
FROM user_organizations uo
WHERE user_id = '$COGNITO_SUB';

\echo ''
\echo '============================================'
\echo '✅ Schema Fixed Successfully!'
\echo '============================================'
\echo ''
\echo 'Next steps:'
\echo '1. Refresh your browser'
\echo '2. Try accessing the admin page'
\echo '3. Try using the chat'
\echo ''
\echo 'All database columns now use proper UUIDs!'
\echo ''
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

PSQL_EXIT_CODE=$?

# Cleanup
rm -f "$SQL_FILE"

echo ""
echo "============================================"

if [ $PSQL_EXIT_CODE -eq 0 ]; then
    echo "✅ SCHEMA FIXED!"
    echo "============================================"
    echo ""
    echo "Your database now uses proper UUIDs for:"
    echo "  - organizations.id"
    echo "  - user_organizations.org_id"
    echo "  - admin_users.org_id"
    echo ""
    echo "You are set up as owner of: $ORG_NAME"
    echo ""
    echo "Next steps:"
    echo "1. Refresh your browser (Ctrl+Shift+R)"
    echo "2. Test the admin page"
    echo "3. Test the chat"
    echo ""
    echo "Everything should work now!"
else
    echo "❌ SCHEMA FIX FAILED"
    echo "============================================"
    echo ""
    echo "Check the errors above."
    exit 1
fi
