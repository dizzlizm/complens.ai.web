#!/bin/bash
# Check CloudFormation stack status and resources

set -e

STACK_NAME="complens-dev"
REGION="us-east-1"

echo "🔍 Checking CloudFormation Stack Status..."
echo "=========================================="
echo ""

# Check if stack exists
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "DOES_NOT_EXIST")

echo "📊 Stack Status: ${STACK_STATUS}"
echo ""

if [ "$STACK_STATUS" = "DOES_NOT_EXIST" ]; then
  echo "❌ Stack does not exist!"
  echo ""
  echo "You need to create the stack first:"
  echo "  cd infrastructure/cloudformation"
  echo "  ./deploy.sh dev"
  exit 1
fi

# If stack is in failed state
if [[ "$STACK_STATUS" == *"FAILED"* ]] || [[ "$STACK_STATUS" == *"ROLLBACK"* ]]; then
  echo "❌ Stack is in failed state: ${STACK_STATUS}"
  echo ""
  echo "Recent stack events (showing failures):"
  aws cloudformation describe-stack-events \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'StackEvents[?ResourceStatus==`CREATE_FAILED` || ResourceStatus==`UPDATE_FAILED`].[Timestamp,ResourceType,LogicalResourceId,ResourceStatusReason]' \
    --output table
  echo ""
  echo "To see all recent events:"
  echo "  aws cloudformation describe-stack-events --stack-name ${STACK_NAME} --region ${REGION} | head -50"
  exit 1
fi

# If stack is in progress
if [[ "$STACK_STATUS" == *"IN_PROGRESS"* ]]; then
  echo "⏳ Stack is currently being deployed: ${STACK_STATUS}"
  echo ""
  echo "Wait for completion before deploying frontend."
  echo ""
  echo "Monitor progress:"
  echo "  aws cloudformation describe-stack-events --stack-name ${STACK_NAME} --region ${REGION} --query 'StackEvents[0:10].[Timestamp,LogicalResourceId,ResourceStatus]' --output table"
  exit 0
fi

# Stack is complete, check resources
echo "✅ Stack Status: ${STACK_STATUS}"
echo ""

# Check if S3 buckets exist
echo "📦 Checking S3 Buckets..."
echo ""

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text 2>/dev/null)

LAMBDA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaCodeBucketName`].OutputValue' \
  --output text 2>/dev/null)

if [ -n "$FRONTEND_BUCKET" ] && [ "$FRONTEND_BUCKET" != "None" ]; then
  echo "Frontend Bucket: ${FRONTEND_BUCKET}"

  # Check if bucket actually exists
  if aws s3 ls "s3://${FRONTEND_BUCKET}" --region ${REGION} 2>/dev/null; then
    echo "  ✅ Bucket exists and is accessible"
  else
    echo "  ❌ Bucket doesn't exist (CloudFormation output present but bucket missing)"
  fi
else
  echo "  ❌ Frontend bucket output not found in stack"
fi

echo ""

if [ -n "$LAMBDA_BUCKET" ] && [ "$LAMBDA_BUCKET" != "None" ]; then
  echo "Lambda Bucket: ${LAMBDA_BUCKET}"

  # Check if bucket actually exists
  if aws s3 ls "s3://${LAMBDA_BUCKET}" --region ${REGION} 2>/dev/null; then
    echo "  ✅ Bucket exists and is accessible"

    # Check if Lambda code is uploaded
    if aws s3 ls "s3://${LAMBDA_BUCKET}/api/latest.zip" --region ${REGION} 2>/dev/null; then
      echo "  ✅ Lambda code uploaded (api/latest.zip exists)"
    else
      echo "  ⚠️  Lambda code NOT uploaded yet"
      echo "     Run: cd backend/lambda/api && npm run build && npm run deploy"
    fi
  else
    echo "  ❌ Bucket doesn't exist"
  fi
else
  echo "  ❌ Lambda bucket output not found in stack"
fi

echo ""
echo "=========================================="
echo ""

# Check Lambda function
echo "🔧 Checking Lambda Function..."
LAMBDA_NAME="dev-complens-api"

if aws lambda get-function --function-name ${LAMBDA_NAME} --region ${REGION} 2>/dev/null >/dev/null; then
  LAMBDA_STATE=$(aws lambda get-function \
    --function-name ${LAMBDA_NAME} \
    --region ${REGION} \
    --query 'Configuration.State' \
    --output text)

  echo "  ✅ Lambda exists: ${LAMBDA_NAME}"
  echo "  📊 State: ${LAMBDA_STATE}"

  if [ "$LAMBDA_STATE" = "Active" ]; then
    echo "  ✅ Lambda is ready"
  elif [ "$LAMBDA_STATE" = "Pending" ]; then
    echo "  ⏳ Lambda is pending (VPC ENI creation - takes 5-10 mins)"
  else
    echo "  ⚠️  Lambda state: ${LAMBDA_STATE}"
  fi
else
  echo "  ❌ Lambda function does NOT exist"
  echo "     The stack needs to be updated to create the Lambda"
fi

echo ""
echo "=========================================="
echo "📋 Summary:"
echo ""

if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
  if [ -n "$FRONTEND_BUCKET" ] && aws s3 ls "s3://${FRONTEND_BUCKET}" --region ${REGION} 2>/dev/null; then
    echo "✅ Stack is ready"
    echo "✅ Frontend bucket exists"
    echo ""
    echo "Next steps:"
    if ! aws s3 ls "s3://${LAMBDA_BUCKET}/api/latest.zip" --region ${REGION} 2>/dev/null; then
      echo "  1. Deploy Lambda code:"
      echo "     cd backend/lambda/api"
      echo "     npm install"
      echo "     npm run build"
      echo "     npm run deploy"
      echo ""
      echo "  2. Update stack to create Lambda function:"
      echo "     cd infrastructure/cloudformation"
      echo "     ./deploy.sh dev"
      echo ""
    fi
    echo "  3. Deploy frontend (GitHub Actions or manually)"
  else
    echo "❌ Stack exists but buckets are missing"
    echo ""
    echo "This shouldn't happen. Try deleting and recreating the stack:"
    echo "  aws cloudformation delete-stack --stack-name ${STACK_NAME} --region ${REGION}"
    echo "  Wait for deletion, then:"
    echo "  cd infrastructure/cloudformation && ./deploy.sh dev"
  fi
else
  echo "⚠️  Stack is not in a stable state: ${STACK_STATUS}"
fi

echo ""
