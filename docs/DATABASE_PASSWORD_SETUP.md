# Database Password Setup

## Problem
RDS requires database passwords that:
- ✅ Use printable ASCII characters
- ❌ Cannot contain: `/`, `@`, `"`, or spaces

## Solution: GitHub Secrets

### 1. Generate a Valid Password

```bash
# Generate a secure password without invalid characters
PASSWORD=$(openssl rand -base64 32 | tr -d '/@" ' | head -c 24)
echo "Generated password: $PASSWORD"
```

**Password Rules:**
- At least 8 characters
- No `/`, `@`, `"`, or spaces
- Use letters, numbers, and symbols like: `!`, `#`, `$`, `%`, `^`, `&`, `*`, `-`, `_`, `+`, `=`

### 2. Add to GitHub Secrets

1. Go to your repository settings:
   ```
   https://github.com/dizzlizm/complens.ai/settings/secrets/actions
   ```

2. Click **"New repository secret"**

3. Add:
   - **Name:** `DB_MASTER_PASSWORD`
   - **Value:** (your generated password)

4. Click **"Add secret"**

### 3. Deploy

The GitHub Actions workflow will automatically use this password when deploying the CloudFormation stack.

## For Local Deployment

If deploying manually with `./deploy.sh`, override the password:

```bash
cd infrastructure/cloudformation

aws cloudformation create-stack \
  --stack-name complens-dev \
  --template-body file://main.yaml \
  --parameters \
    ParameterKey=Environment,ParameterValue=dev \
    ParameterKey=DomainPrefix,ParameterValue=app.dev \
    ParameterKey=DBMasterUsername,ParameterValue=complensadmin \
    ParameterKey=DBMasterPassword,ParameterValue=YOUR_SECURE_PASSWORD_HERE \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

## Security Notes

- ⚠️ **Never commit passwords to git**
- ✅ Always use GitHub Secrets or AWS Secrets Manager
- ✅ Rotate passwords regularly
- ✅ Use different passwords for dev/prod environments
