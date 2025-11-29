# Database Migration Guide

## 🎯 Problem

You need to run database migrations, but your RDS instance is in a **private subnet** (no direct internet access). This is the right security setup, but it means you can't just `psql` to it from your laptop.

## 📋 Migrations to Run

You have **3 migrations** to run in order:

1. `002_create_security_tables.sql` - Organizations, security findings, GWS data
2. `003_create_admin_users.sql` - Admin users table
3. `004_multi_tenant_isolation.sql` - Multi-tenant user-org mapping

## 🚀 **Solution Options**

### **Option 1: Temporary Security Group Rule** (Easiest, Not Recommended for Prod)

Temporarily allow your IP to access RDS:

```bash
# 1. Get your public IP
MY_IP=$(curl -s https://api.ipify.org)
echo "Your IP: $MY_IP"

# 2. Get RDS security group ID
SG_ID=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`DatabaseSecurityGroupId`].OutputValue' \
  --output text)

# If not found, get from RDS instance:
SG_ID=$(aws rds describe-db-instances \
  --query 'DBInstances[?contains(DBInstanceIdentifier, `complens`)].VpcSecurityGroups[0].VpcSecurityGroupId | [0]' \
  --output text)

echo "Security Group: $SG_ID"

# 3. Add temporary rule (REMOVE AFTER MIGRATION!)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr ${MY_IP}/32 \
  --region us-east-1

echo "✅ Your IP is now allowed. Run migrations, then REMOVE this rule:"
echo "aws ec2 revoke-security-group-ingress --group-id $SG_ID --protocol tcp --port 5432 --cidr ${MY_IP}/32"

# 4. Run migrations
./scripts/run-all-migrations.sh

# 5. REMOVE the rule when done
aws ec2 revoke-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 5432 \
  --cidr ${MY_IP}/32 \
  --region us-east-1
```

**Pros:** Simple, direct connection

**Cons:** Opens RDS to internet temporarily, must remember to remove rule

---

### **Option 2: AWS Systems Manager Session Manager** (Recommended)

Use AWS Session Manager to tunnel through the Lambda's VPC:

```bash
# 1. Install Session Manager plugin (one-time)
# macOS:
brew install --cask session-manager-plugin

# Linux:
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
sudo dpkg -i session-manager-plugin.deb

# 2. Get RDS endpoint and credentials
./scripts/get-rds-connection.sh

# This will output connection details

# 3. Connect via Session Manager (creates a tunnel)
# Unfortunately, Lambda doesn't support SSM by default
# You need an EC2 bastion instance for this
```

**This requires setting up a bastion host. See Option 3 below.**

---

### **Option 3: EC2 Bastion Host** (Production Best Practice)

Create a small EC2 instance in the same VPC to access RDS:

```bash
# 1. Launch a tiny EC2 instance in the same VPC as RDS
# (You can do this via AWS Console or CloudFormation)

# 2. SSH to the instance
ssh -i your-key.pem ec2-user@BASTION_IP

# 3. Install PostgreSQL client on the bastion
sudo yum install postgresql15 -y  # Amazon Linux
# or
sudo apt-get install postgresql-client -y  # Ubuntu

# 4. Get database credentials
aws secretsmanager get-secret-value \
  --secret-id YOUR_SECRET_ARN \
  --query SecretString \
  --output text

# 5. Connect to RDS from bastion
psql -h RDS_ENDPOINT -U postgres -d complens

# 6. Run migrations
\i /path/to/002_create_security_tables.sql
\i /path/to/003_create_admin_users.sql
\i /path/to/004_multi_tenant_isolation.sql
```

---

### **Option 4: SSH Tunnel via EC2** (Recommended for Development)

If you already have an EC2 instance in the VPC:

```bash
# 1. Create SSH tunnel to RDS through EC2 bastion
ssh -i your-key.pem -L 5432:RDS_ENDPOINT:5432 ec2-user@BASTION_IP -N

# This runs in background, creating a tunnel:
# localhost:5432 → EC2 → RDS:5432

# 2. In another terminal, connect to localhost
psql -h localhost -U postgres -d complens

# 3. Run migrations
\i backend/database/migrations/002_create_security_tables.sql
\i backend/database/migrations/003_create_admin_users.sql
\i backend/database/migrations/004_multi_tenant_isolation.sql
```

---

### **Option 5: AWS CloudShell** (Quick and Dirty)

Use AWS CloudShell (already in your VPC):

```bash
# 1. Open AWS CloudShell in AWS Console
# https://console.aws.amazon.com/cloudshell

# 2. Install PostgreSQL client
sudo yum install postgresql15 -y

# 3. Clone your repo
git clone https://github.com/your-username/complens.ai
cd complens.ai

# 4. Get credentials
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
  --output text)

aws secretsmanager get-secret-value \
  --secret-id $SECRET_ARN \
  --query SecretString

# 5. Run migrations
psql -h RDS_ENDPOINT -U postgres -d complens \
  -f backend/database/migrations/002_create_security_tables.sql

psql -h RDS_ENDPOINT -U postgres -d complens \
  -f backend/database/migrations/003_create_admin_users.sql

psql -h RDS_ENDPOINT -U postgres -d complens \
  -f backend/database/migrations/004_multi_tenant_isolation.sql
```

**Pros:** No setup needed, already in AWS network

**Cons:** CloudShell may not have VPC access depending on your setup

---

## 🎯 **Recommended Approach**

For **right now** (one-time migration):
→ **Option 1** (Temporary security group rule) - Just remember to remove it!

For **future** (repeatable migrations):
→ **Option 4** (SSH tunnel via bastion) - Best developer experience

For **production**:
→ Set up automated migrations with Flyway or Liquibase

---

## 🏃 **Quick Start (Option 1)**

```bash
# Run this ONE-LINER to add your IP, run migrations, then remove your IP:
MY_IP=$(curl -s https://api.ipify.org) && \
SG_ID=$(aws rds describe-db-instances --query 'DBInstances[?contains(DBInstanceIdentifier, `complens`)].VpcSecurityGroups[0].VpcSecurityGroupId | [0]' --output text) && \
aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 5432 --cidr ${MY_IP}/32 && \
./scripts/run-all-migrations.sh && \
aws ec2 revoke-security-group-ingress --group-id $SG_ID --protocol tcp --port 5432 --cidr ${MY_IP}/32
```

**That's it!** One command to:
1. ✅ Add your IP to security group
2. ✅ Run all migrations (002, 003, 004)
3. ✅ Remove your IP from security group

---

## 🔍 **Verify Migrations Ran**

After running migrations, verify:

```bash
# Get credentials
./scripts/get-rds-connection.sh

# Connect and check
psql -h RDS_ENDPOINT -U postgres -d complens

# In psql:
\dt  -- List all tables

# Should see:
-- conversations
-- messages
-- organizations
-- user_organizations  ← NEW!
-- saml_providers      ← NEW!
-- audit_logs          ← NEW!
-- admin_users
-- findings
-- gws_users
-- etc.

# Check migration tracking
SELECT * FROM schema_migrations ORDER BY version;

-- Should show:
-- version | name
-- --------+-------------------------
--    2    | create_security_tables
--    3    | create_admin_users
--    4    | multi_tenant_isolation  ← NEW!
```

---

## ⚠️ **Troubleshooting**

### "Connection refused" or "timeout"

RDS is in a private subnet. Use one of the options above to get access.

### "FATAL: password authentication failed"

Get correct password from Secrets Manager:
```bash
aws secretsmanager get-secret-value \
  --secret-id YOUR_SECRET_ARN \
  --query SecretString \
  --output text | jq -r '.dbPassword'
```

### "relation already exists"

Migrations were partially run. Check which migration failed and fix it, or manually drop conflicting tables.

### "permission denied for schema public"

Your database user doesn't have permissions. Make sure you're using the master user (usually `postgres`).

---

## 📚 **Next Steps After Migration**

1. ✅ Migrations complete
2. Deploy backend: `cd backend && sam build && sam deploy`
3. Clear browser cache
4. Log in to dev.complens.ai
5. Send a chat message → Auto-provision creates your org!
6. Check Admin → Users → See yourself as owner

---

## 🔐 **Security Best Practices**

- ✅ RDS in private subnet (you're doing this!)
- ✅ Use bastion host for admin access
- ✅ Never expose RDS to 0.0.0.0/0
- ✅ Use temporary security group rules (and remove them!)
- ✅ Rotate database passwords regularly
- ✅ Use IAM authentication for RDS (advanced)

---

**You're all set! Run those migrations! 🚀**
