# Setting Up Your First Admin User

If you created your Cognito user BEFORE running the database migrations, you'll get a 401 error on the admin page. This is because your user doesn't have an organization mapping yet.

## Quick Fix (Option 1: Automatic)

Use the `/debug/me` endpoint to trigger auto-provisioning:

```bash
# Get your JWT token from the browser (see below)
# Then call the debug endpoint:
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://YOUR_API_GATEWAY_URL/dev/debug/me

# If auto-provisioning works, you'll see your organization created
# Then try accessing the admin page again
```

## Manual Fix (Option 2: Database)

If auto-provisioning didn't work, manually create the organization mapping:

### Step 1: Get Your JWT Token

1. Log in to https://dev.complens.ai
2. Open browser DevTools (F12)
3. Go to **Application** > **Local Storage** or **Session Storage**
4. Look for a key like `idToken`, `accessToken`, or similar
5. Copy the long string (JWT token)

### Step 2: Extract Your Cognito User ID

Run the helper script:

```bash
# On your local machine
chmod +x scripts/get-my-cognito-sub.sh
./scripts/get-my-cognito-sub.sh

# Paste your JWT token when prompted
# It will show you your Cognito sub (user ID), email, and name
```

**Example output:**
```
Your Cognito User ID (sub): 12345678-1234-1234-1234-123456789abc
Email: your-email@example.com
Name: Your Name
```

### Step 3: Connect to Database via Bastion

```bash
# Get bastion instance ID
BASTION_ID=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BastionInstanceId`].OutputValue' \
  --output text)

# Connect to bastion
aws ssm start-session --target $BASTION_ID --region us-east-1

# On the bastion, connect to RDS
sudo /usr/local/bin/connect-rds.sh
```

### Step 4: Check if You Already Have an Organization

```sql
-- In PostgreSQL (connected via bastion)
SELECT
    uo.user_id,
    uo.role,
    uo.is_primary,
    o.name as org_name,
    o.id as org_id
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = 'YOUR_COGNITO_SUB';  -- Replace with your actual sub
```

**If you see results:** You already have an organization! The 401 might be a different issue. Skip to troubleshooting.

**If no results:** Continue to Step 5.

### Step 5: Create Organization and Owner Mapping

```sql
-- 1. Create your organization
INSERT INTO organizations (name, domain, tier, max_users, max_conversations_per_month, features)
VALUES (
    'My Organization',  -- Replace with your org name
    'example.com',      -- Replace with your email domain
    'free',
    10,
    1000,
    '{"api_access": true, "advanced_security": true}'::jsonb
)
RETURNING id, name;

-- Note the org_id returned above (e.g., 123e4567-e89b-12d3-a456-426614174000)

-- 2. Add yourself as the owner
INSERT INTO user_organizations (user_id, org_id, role, auth_provider, is_primary, metadata)
VALUES (
    '12345678-1234-1234-1234-123456789abc',  -- YOUR Cognito sub from Step 2
    '123e4567-e89b-12d3-a456-426614174000',  -- The org_id from step 1 above
    'owner',
    'cognito',
    true,
    '{"email": "your-email@example.com", "name": "Your Name"}'::jsonb
);

-- 3. Verify it worked
SELECT
    uo.user_id,
    uo.role,
    uo.is_primary,
    o.name as org_name,
    o.tier,
    uo.metadata
FROM user_organizations uo
JOIN organizations o ON uo.org_id = o.id
WHERE uo.user_id = 'YOUR_COGNITO_SUB';

-- You should see your user as 'owner' of your organization
```

### Step 6: Test the Admin Page

1. Refresh your browser (or log out and back in)
2. Go to the admin page
3. You should now see the admin interface!

## Alternative: Use the Pre-made SQL Script

We've created a template SQL script for you:

```bash
# 1. Download the template
cat scripts/setup-admin-user.sql

# 2. Edit it with your information:
#    - Replace YOUR_COGNITO_SUB with your sub from Step 2
#    - Replace YOUR_EMAIL with your email
#    - Replace 'My Organization' and 'example.com' with your details

# 3. Run it on the bastion:
# (After uploading the edited file to the bastion)
sudo /usr/local/bin/connect-rds.sh < setup-admin-user.sql
```

## Troubleshooting

### Still Getting 401 After Setup?

Check your JWT token expiration:

```bash
# Decode your JWT and check 'exp' field
# If expired, log out and log back in to get a fresh token
```

### Getting 403 Instead of 401?

This means you're authenticated but don't have permission:

```sql
-- Check your role
SELECT role FROM user_organizations WHERE user_id = 'YOUR_COGNITO_SUB';

-- Should be 'owner' or 'admin' for admin page access
-- If it's 'member', update it:
UPDATE user_organizations
SET role = 'owner'
WHERE user_id = 'YOUR_COGNITO_SUB';
```

### Auto-Provisioning Should Have Worked?

Check the Lambda logs for errors:

```bash
aws logs tail /aws/lambda/dev-complens-api --follow
```

Look for messages like:
- "Auto-provisioning organization for user..."
- "User already has organizations..."
- Any errors in the extractTenantContext function

## Understanding the Roles

- **owner**: Full access, can delete organization, manage billing
- **admin**: Can manage users, view all data, configure settings
- **member**: Can only access their own conversations

For the admin page, you need to be at least an **admin**, but **owner** is recommended for the first user.

## Prevention for Future Users

Once your first user is set up as owner, new users who sign up will:
1. Auto-provision their own organization (they become owner)
2. OR you can invite them to your organization via the admin page

The 401 issue only happens if:
1. You created the Cognito user BEFORE running migrations, OR
2. Auto-provisioning failed for some reason

---

**After following these steps, you should have full admin access!** 🎉

If you're still having issues, check the Lambda logs or the `/debug/me` endpoint response for clues.
