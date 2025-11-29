# Bastion Host Connection Guide

## Overview

Your CloudFormation stack now includes a lightweight EC2 bastion host in the private subnet. This provides secure access to your RDS database via AWS Systems Manager (SSM) Session Manager - **no SSH keys required!**

## What's Included

- **EC2 Instance**: t3.micro (free tier eligible) running Amazon Linux 2023
- **Location**: Private subnet (same network as RDS)
- **Access Method**: AWS SSM Session Manager (no open SSH ports!)
- **Pre-installed Tools**:
  - PostgreSQL 15 client
  - jq (JSON parsing)
  - Helper scripts for database access

## Prerequisites

Install the AWS Session Manager plugin on your local machine:

```bash
# macOS
brew install --cask session-manager-plugin

# Linux (Ubuntu/Debian)
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o "session-manager-plugin.deb"
sudo dpkg -i session-manager-plugin.deb

# Windows
# Download from: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html
```

## Getting the Bastion Instance ID

After deploying your CloudFormation stack:

```bash
# Get bastion instance ID from stack outputs
BASTION_ID=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BastionInstanceId`].OutputValue' \
  --output text)

echo "Bastion Instance: $BASTION_ID"
```

## Connecting to the Bastion

### Method 1: Direct Connection (Recommended)

```bash
# Connect to bastion via SSM (no SSH key needed!)
aws ssm start-session \
  --target $BASTION_ID \
  --region us-east-1
```

You're now connected to the bastion host!

### Method 2: Using CloudFormation Output Command

```bash
# Get the pre-formatted connection command
aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BastionConnectionCommand`].OutputValue' \
  --output text

# Copy and run the command shown
```

## Connecting to RDS from Bastion

Once connected to the bastion, you have two helper scripts:

### Option 1: Interactive psql Session

```bash
# On the bastion host
sudo /usr/local/bin/connect-rds.sh
```

This script:
- Automatically fetches RDS credentials from Secrets Manager
- Connects you to PostgreSQL with `psql`
- No need to remember passwords!

### Option 2: Run Database Migrations

```bash
# On the bastion host
cd /tmp

# Upload your migration files (from another terminal on your local machine):
# aws ssm start-session --target $BASTION_ID --document-name AWS-StartInteractiveCommand --parameters command="cat > /tmp/002_create_security_tables.sql << 'EOF'
# <paste file contents>
# EOF"

# Or use AWS S3 to transfer files:
# aws s3 cp backend/database/migrations/ s3://my-bucket/migrations/ --recursive
# Then on bastion: aws s3 sync s3://my-bucket/migrations/ /tmp/

# Run migrations
sudo /usr/local/bin/run-migrations.sh
```

## Uploading Migration Files to Bastion

### Method 1: Copy-Paste via SSM (Small Files)

```bash
# On your local machine
cat backend/database/migrations/002_create_security_tables.sql

# On the bastion (in SSM session)
cat > /tmp/002_create_security_tables.sql << 'EOF'
# Paste the SQL content here
EOF
```

### Method 2: S3 Transfer (Recommended for Multiple Files)

```bash
# On your local machine
# Upload migrations to S3
aws s3 cp backend/database/migrations/ s3://${AWS_ACCOUNT_ID}-dev-complens-lambda-code/migrations/ --recursive

# On the bastion
aws s3 sync s3://${AWS_ACCOUNT_ID}-dev-complens-lambda-code/migrations/ /tmp/
cd /tmp
sudo /usr/local/bin/run-migrations.sh
```

### Method 3: GitHub Clone (If repo is public or you have credentials)

```bash
# On the bastion
cd /tmp
git clone https://github.com/your-username/complens.ai.git
cd complens.ai/backend/database/migrations
sudo /usr/local/bin/run-migrations.sh
```

## Manual Database Connection

If you prefer to connect manually without the helper script:

```bash
# On the bastion
# Get credentials
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name complens-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`SecretsArn`].OutputValue' \
  --output text)

SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" \
  --region us-east-1 \
  --query SecretString \
  --output text)

# Parse credentials
DB_HOST=$(echo "$SECRET_JSON" | jq -r '.dbHost')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbName')
DB_USER=$(echo "$SECRET_JSON" | jq -r '.dbUsername')
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.dbPassword')

# Connect
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME"
```

## Port Forwarding (Optional Advanced Use)

You can create a local tunnel to access RDS from your laptop:

```bash
# On your local machine
aws ssm start-session \
  --target $BASTION_ID \
  --region us-east-1 \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["YOUR_RDS_ENDPOINT"],"portNumber":["5432"], "localPortNumber":["5432"]}'

# In another terminal, connect to localhost
psql -h localhost -U postgres -d complens
```

## Cost

The bastion host costs approximately:
- **t3.micro**: ~$7.50/month (free tier: 750 hours/month)
- **VPC Endpoints for SSM**: ~$21.60/month (3 endpoints × $7.20/month)
- **Total**: ~$29/month (or ~$22/month if within free tier)

**Cost Optimization**: If you only need occasional access, you can:
1. Stop the instance when not in use: `aws ec2 stop-instances --instance-ids $BASTION_ID`
2. Start it when needed: `aws ec2 start-instances --instance-ids $BASTION_ID`
3. This reduces cost to ~$22/month (just VPC endpoints)

## Security Notes

✅ **What makes this secure:**
- No SSH port (22) exposed to internet
- No public IP address
- Access only via AWS IAM credentials + SSM
- In private subnet with security group restrictions
- All connections logged in CloudTrail

❌ **Don't do this:**
- Don't expose SSH port 22
- Don't assign a public IP
- Don't share IAM credentials

## Troubleshooting

### "TargetNotConnected" Error

The bastion instance might be starting up. Wait 2-3 minutes after stack creation.

```bash
# Check instance status
aws ec2 describe-instance-status --instance-ids $BASTION_ID

# Check SSM agent is running
aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$BASTION_ID"
```

### Can't Connect to RDS from Bastion

```bash
# On bastion, test connectivity
nc -zv $DB_HOST 5432

# Check security group allows traffic
aws ec2 describe-security-groups --group-ids $RDS_SG_ID
```

### Session Manager Plugin Not Found

Install the plugin: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html

## Quick Reference

```bash
# Connect to bastion
aws ssm start-session --target $BASTION_ID --region us-east-1

# On bastion: Connect to RDS
sudo /usr/local/bin/connect-rds.sh

# On bastion: Run migrations
cd /tmp
# (upload SQL files first)
sudo /usr/local/bin/run-migrations.sh

# Stop bastion (save costs)
aws ec2 stop-instances --instance-ids $BASTION_ID

# Start bastion
aws ec2 start-instances --instance-ids $BASTION_ID
```

---

**You're all set!** This bastion host provides secure, permanent access to your RDS database without exposing it to the internet. 🎉
