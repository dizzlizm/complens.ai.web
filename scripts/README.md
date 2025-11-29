# Database Setup Scripts

These scripts help you set up your first admin user and manage database migrations from the bastion host.

## Quick Start - First Time Setup

If you're setting up your first admin user, just run ONE script:

```bash
# On the bastion host
cd /tmp
git clone https://github.com/dizzlizm/complens.ai.git
cd complens.ai/scripts

# Run the all-in-one setup
sudo bash setup-first-admin.sh
```

This script will:
1. ✅ Fix the organizations table (add missing columns)
2. ✅ Create your organization
3. ✅ Add you as the owner with full admin access

That's it! Then refresh your browser and access the admin page.

## Available Scripts

### 🚀 Recommended Scripts

**`setup-first-admin.sh`** - **USE THIS ONE**
- Complete all-in-one setup for first admin user
- Fixes table structure + creates org + sets up owner
- This is the easiest option!

### 🔧 Individual Scripts (if you need them)

**`fix-organizations-table.sh`**
- Only fixes the organizations table structure
- Adds missing columns (tier, max_users, features, etc.)
- Use if you just need to repair the table

**`setup-owner.sh`**
- Only creates organization and owner mapping
- Assumes the table is already fixed
- Use if you already ran fix-organizations-table.sh

**`bastion-setup-owner.sh`**
- Alternative setup script (older version)
- Does the same as setup-owner.sh

### 📊 Helper Scripts

**`get-my-cognito-sub.sh`** (Run on LOCAL machine)
- Extracts your Cognito user ID from JWT token
- Helps you find your sub for the setup scripts
- Run locally, not on bastion

**`get-rds-connection.sh`** (Run on LOCAL machine)
- Gets RDS connection details from CloudFormation
- Shows connection commands
- Run locally, not on bastion

**`run-all-migrations.sh`** (Run on LOCAL machine)
- Runs all database migrations (002, 003, 004)
- For initial database setup
- Run locally with proper RDS access

## How to Get Your Cognito User ID

You need this for the setup scripts:

### Option 1: AWS Console (Easiest)
1. Go to AWS Console > Cognito > User Pools
2. Click **dev-complens-users**
3. Click **Users** tab
4. Click on your user
5. Copy the **Username** field (that's your Cognito sub)

### Option 2: Extract from JWT Token
```bash
# On your local machine
./get-my-cognito-sub.sh
# Paste your JWT token when prompted
```

## Troubleshooting

### "Column does not exist" errors
Run `fix-organizations-table.sh` first to add missing columns.

### "User already exists"
You're already set up! Check if you can access the admin page. If you get 401, your role might be wrong - check the database.

### Can't connect to bastion
Make sure you have the Session Manager plugin installed:
```bash
# macOS
brew install --cask session-manager-plugin

# Linux
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
sudo dpkg -i session-manager-plugin.deb
```

### SQL errors
The scripts show detailed error messages. Read them carefully - they usually tell you exactly what's wrong.

## Full Documentation

- **BASTION_GUIDE.md** - How to connect to bastion and RDS
- **SETUP_FIRST_ADMIN.md** - Detailed admin setup guide
- **MIGRATION_GUIDE.md** - How to run database migrations

## Support

If something isn't working:
1. Check the script output for error messages
2. Read the detailed guides (above)
3. Check CloudWatch Logs for Lambda errors
4. Verify migrations ran successfully
