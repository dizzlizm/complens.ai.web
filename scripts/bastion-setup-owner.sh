#!/bin/bash
# ============================================================================
# Bastion Host - Setup First Organization Owner
# ============================================================================
# This script runs ON THE BASTION HOST and automatically:
# 1. Prompts for user information
# 2. Creates organization
# 3. Sets up user as owner
# 4. Verifies everything worked
# ============================================================================

set -e

echo "============================================"
echo "Setup First Organization Owner"
echo "============================================"
echo ""

# Prompt for information
echo "Enter the following information:"
echo ""
read -p "Cognito User ID (sub): " COGNITO_SUB
read -p "Email address: " USER_EMAIL
read -p "Full name: " USER_NAME
read -p "Organization name (default: My Organization): " ORG_NAME
ORG_NAME=${ORG_NAME:-"My Organization"}

echo ""
echo "============================================"
echo "Configuration:"
echo "============================================"
echo "Cognito Sub: $COGNITO_SUB"
echo "Email: $USER_EMAIL"
echo "Name: $USER_NAME"
echo "Organization: $ORG_NAME"
echo ""
read -p "Proceed? (y/n): " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "============================================"
echo "Connecting to database..."
echo "============================================"

# Get database credentials from Secrets Manager
SECRET_ARN=$(aws cloudformation describe-stacks \
    --stack-name complens-dev \
    --region us-east-1 \
    --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
    --output text 2>/dev/null || echo "${ApplicationSecrets:-}")

if [ -z "$SECRET_ARN" ]; then
    echo "❌ Could not find Secrets ARN"
    echo "Trying default location..."
    SECRET_ARN="dev/complens/app-secrets"
fi

echo "Fetching credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
    --secret-id "$SECRET_ARN" \
    --region us-east-1 \
    --query SecretString \
    --output text)

DB_HOST=$(echo "$SECRET_JSON" | jq -r '.dbHost')
DB_PORT=$(echo "$SECRET_JSON" | jq -r '.dbPort')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbName')
DB_USER=$(echo "$SECRET_JSON" | jq -r '.dbUsername')
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.dbPassword')

echo "Connected to: $DB_NAME at $DB_HOST:$DB_PORT"
echo ""

# Extract domain from email
DOMAIN=$(echo "$USER_EMAIL" | cut -d'@' -f2)

# Create temporary SQL file
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << EOF
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
        RAISE NOTICE '⚠️  User already exists!';
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

        RAISE NOTICE '✅ Created organization (ID: %)', v_org_id;

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
    END IF;
END \$\$;

-- Show results
SELECT
    'SUCCESS ✅' as status,
    uo.user_id,
    uo.role,
    o.name as organization,
    o.tier,
    uo.metadata->>'email' as email
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = '$COGNITO_SUB';
EOF

echo "============================================"
echo "Running SQL..."
echo "============================================"
echo ""

# Run SQL
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
echo "✅ Setup Complete!"
echo "============================================"
echo ""
echo "You can now:"
echo "1. Refresh your browser"
echo "2. Access the admin page"
echo "3. You are the organization owner!"
echo ""
