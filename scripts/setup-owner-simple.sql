-- Simplified setup script that works with minimal organizations table
-- Use this if the organizations table doesn't have all the new columns yet

DO $$
DECLARE
    v_org_id UUID;
    -- ⬇️ REPLACE THESE VALUES ⬇️
    v_cognito_sub TEXT := 'YOUR_COGNITO_SUB_HERE';
    v_email TEXT := 'your@email.com';
    v_name TEXT := 'Your Name';
    v_org_name TEXT := 'My Organization';
    -- ⬆️ REPLACE THESE VALUES ⬆️

    v_domain TEXT;
    v_existing_count INTEGER;
    v_has_tier BOOLEAN;
    v_has_max_users BOOLEAN;
    v_has_features BOOLEAN;
BEGIN
    v_domain := split_part(v_email, '@', 2);

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Setting up organization owner';
    RAISE NOTICE '============================================';

    -- Check if user already exists
    SELECT COUNT(*) INTO v_existing_count
    FROM user_organizations WHERE user_id = v_cognito_sub;

    IF v_existing_count > 0 THEN
        RAISE NOTICE '⚠️  User already exists!';
        RETURN;
    END IF;

    -- Check which columns exist in organizations table
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

    -- Create organization with only the columns that exist
    IF v_has_tier AND v_has_max_users AND v_has_features THEN
        -- Full version with all new columns
        INSERT INTO organizations (name, domain, tier, max_users, max_conversations_per_month, features)
        VALUES (v_org_name, v_domain, 'free', 10, 1000, '{"api_access": true}'::jsonb)
        RETURNING id INTO v_org_id;
    ELSE
        -- Minimal version with just required columns
        INSERT INTO organizations (name, domain)
        VALUES (v_org_name, v_domain)
        RETURNING id INTO v_org_id;
    END IF;

    RAISE NOTICE '✅ Created organization: % (ID: %)', v_org_name, v_org_id;

    -- Create user-organization mapping
    INSERT INTO user_organizations (user_id, org_id, role, auth_provider, is_primary, metadata)
    VALUES (v_cognito_sub, v_org_id, 'owner', 'cognito', true,
            jsonb_build_object('email', v_email, 'name', v_name));

    RAISE NOTICE '✅ Added user as owner';
    RAISE NOTICE '============================================';
END $$;

-- Verify it worked
SELECT
    uo.role,
    o.name as organization,
    uo.metadata->>'email' as email
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = 'YOUR_COGNITO_SUB_HERE';  -- Replace this too
