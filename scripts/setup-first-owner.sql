-- ============================================================================
-- Setup First Organization Owner
-- ============================================================================
-- This script creates an organization and sets up the first owner user.
-- All IDs are handled automatically - just replace the values below.
-- ============================================================================

-- STEP 1: Replace these values with your information
\set cognito_sub 'YOUR_COGNITO_SUB_HERE'
\set user_email 'your-email@example.com'
\set user_name 'Your Name'
\set org_name 'My Organization'

-- STEP 2: Run this entire script
-- Everything below happens automatically

DO $$
DECLARE
    v_org_id UUID;
    v_cognito_sub TEXT := :'cognito_sub';
    v_email TEXT := :'user_email';
    v_name TEXT := :'user_name';
    v_org_name TEXT := :'org_name';
    v_domain TEXT;
    v_existing_count INTEGER;
BEGIN
    -- Extract domain from email
    v_domain := split_part(v_email, '@', 2);

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Setting up first organization owner';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Cognito User ID: %', v_cognito_sub;
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE 'Domain: %', v_domain;
    RAISE NOTICE '';

    -- Check if user already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM user_organizations
    WHERE user_id = v_cognito_sub;

    IF v_existing_count > 0 THEN
        RAISE NOTICE '⚠️  User already exists in user_organizations table!';
        RAISE NOTICE 'Current mappings:';
        RAISE NOTICE '';
    ELSE
        -- Create organization
        INSERT INTO organizations (
            name,
            domain,
            tier,
            max_users,
            max_conversations_per_month,
            features,
            created_at
        )
        VALUES (
            v_org_name,
            v_domain,
            'free',
            10,
            1000,
            '{"api_access": true, "advanced_security": true}'::jsonb,
            NOW()
        )
        RETURNING id INTO v_org_id;

        RAISE NOTICE '✅ Created organization: % (ID: %)', v_org_name, v_org_id;

        -- Create user-organization mapping as owner
        INSERT INTO user_organizations (
            user_id,
            org_id,
            role,
            auth_provider,
            is_primary,
            metadata,
            created_at
        )
        VALUES (
            v_cognito_sub,
            v_org_id,
            'owner',
            'cognito',
            true,
            jsonb_build_object(
                'email', v_email,
                'name', v_name,
                'setup_date', NOW()
            ),
            NOW()
        );

        RAISE NOTICE '✅ Added user as owner of organization';
        RAISE NOTICE '';
    END IF;

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Final Status:';
    RAISE NOTICE '============================================';
END $$;

-- Display final results
SELECT
    '✅ SUCCESS' as status,
    uo.user_id,
    uo.role,
    uo.is_primary,
    uo.auth_provider,
    o.name as organization_name,
    o.domain,
    o.tier,
    o.id as org_id,
    uo.metadata->>'email' as email,
    uo.created_at as joined_at
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = :'cognito_sub';

-- If no results, show error
SELECT CASE
    WHEN NOT EXISTS (
        SELECT 1 FROM user_organizations WHERE user_id = :'cognito_sub'
    ) THEN '❌ ERROR: User not found! Check the Cognito sub value.'
    ELSE '✅ Setup complete!'
END as result;
