-- Check your organization and user mapping
-- Run this on the bastion to diagnose the UUID issue

\echo '============================================'
\echo 'Checking your user-organization mapping:'
\echo '============================================'
\echo ''

-- Show your organizations
SELECT
    id as org_id,
    name,
    domain,
    pg_typeof(id) as id_type
FROM organizations
ORDER BY created_at DESC
LIMIT 5;

\echo ''
\echo '============================================'
\echo 'Checking your user mapping:'
\echo '============================================'
\echo ''

-- Show all user_organizations mappings
SELECT
    user_id,
    org_id,
    role,
    auth_provider,
    is_primary,
    pg_typeof(org_id) as org_id_type,
    metadata->>'email' as email
FROM user_organizations
ORDER BY created_at DESC
LIMIT 10;

\echo ''
\echo '============================================'
\echo 'Diagnosis:'
\echo '============================================'
\echo ''
\echo 'If org_id_type shows "integer" or "bigint", that is the problem!'
\echo 'It should show "uuid".'
\echo ''
\echo 'If you see org_id = 1, that means the organization table'
\echo 'has an integer ID instead of UUID.'
\echo ''
