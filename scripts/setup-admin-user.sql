-- Script to set up a Cognito user as organization owner
-- Replace YOUR_COGNITO_SUB and YOUR_EMAIL with your actual values

-- First, check if user already has an organization
SELECT
    uo.user_id,
    uo.role,
    uo.is_primary,
    o.name as org_name,
    o.id as org_id
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = 'YOUR_COGNITO_SUB';  -- Replace with your Cognito sub

-- If no results above, run the following to create organization and owner mapping:

-- 1. Create organization (skip if you already have one)
INSERT INTO organizations (name, domain, tier, max_users, max_conversations_per_month, features)
VALUES (
    'My Organization',  -- Replace with your org name
    'example.com',      -- Replace with your domain
    'free',
    10,
    1000,
    '{"api_access": true, "advanced_security": true}'::jsonb
)
ON CONFLICT DO NOTHING
RETURNING id, name;

-- 2. Add yourself as owner (replace the org_id with the one from above or an existing one)
INSERT INTO user_organizations (user_id, org_id, role, auth_provider, is_primary, metadata)
VALUES (
    'YOUR_COGNITO_SUB',  -- Replace with your Cognito sub from JWT token
    (SELECT id FROM organizations WHERE domain = 'example.com' LIMIT 1),  -- Or use specific org_id
    'owner',
    'cognito',
    true,
    '{"email": "YOUR_EMAIL", "name": "Your Name"}'::jsonb  -- Replace with your info
)
ON CONFLICT (user_id, org_id)
DO UPDATE SET
    role = 'owner',
    is_primary = true,
    metadata = EXCLUDED.metadata;

-- 3. Verify the setup
SELECT
    uo.user_id,
    uo.role,
    uo.is_primary,
    uo.auth_provider,
    o.name as org_name,
    o.id as org_id,
    o.tier,
    uo.metadata
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = 'YOUR_COGNITO_SUB';
