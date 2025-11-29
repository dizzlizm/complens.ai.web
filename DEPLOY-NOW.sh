#!/bin/bash
# IMMEDIATE Lambda Deployment - Run this NOW
set -e

cd /home/user/complens.ai/backend/lambda/api

echo "🧹 Cleaning..."
rm -rf node_modules

echo "📦 Installing production deps..."
npm install --production --quiet

echo "📦 Creating package..."
zip -r -q /tmp/lambda-deploy.zip . -x '*.git*' 'tests/*' '*.md'

echo "📤 Uploading and updating Lambda..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="${ACCOUNT_ID}-dev-complens-lambda-code"

aws s3 cp /tmp/lambda-deploy.zip "s3://${BUCKET}/api/latest.zip" --region us-east-1

aws lambda update-function-code \
  --function-name dev-complens-api \
  --s3-bucket ${BUCKET} \
  --s3-key api/latest.zip \
  --region us-east-1

echo "⏳ Waiting for update..."
aws lambda wait function-updated --function-name dev-complens-api --region us-east-1

echo "✅ DEPLOYED! Test now at https://dev.complens.ai"
