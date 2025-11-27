#!/bin/bash

# Complens.ai Infrastructure Deployment Script
# This script deploys the CloudFormation stack for the specified environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-dev}
STACK_NAME="complens-${ENVIRONMENT}"
REGION=${AWS_REGION:-us-east-1}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Complens.ai Infrastructure Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Stack Name: ${YELLOW}${STACK_NAME}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check if parameter file exists
PARAM_FILE="parameters/${ENVIRONMENT}.json"
if [ ! -f "$PARAM_FILE" ]; then
    echo -e "${RED}Error: Parameter file not found: ${PARAM_FILE}${NC}"
    exit 1
fi

# Warning about database password
echo -e "${YELLOW}⚠️  IMPORTANT: Make sure to update the DBMasterPassword in ${PARAM_FILE}${NC}"
echo -e "${YELLOW}   Do NOT use the default password in production!${NC}"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Validate template
echo -e "${GREEN}Validating CloudFormation template...${NC}"
aws cloudformation validate-template \
    --template-body file://main.yaml \
    --region ${REGION} > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Template is valid${NC}"
else
    echo -e "${RED}✗ Template validation failed${NC}"
    exit 1
fi

# Check if stack exists
STACK_EXISTS=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} 2>&1 || true)

if echo "$STACK_EXISTS" | grep -q "does not exist"; then
    # Create new stack
    echo -e "${GREEN}Creating new stack: ${STACK_NAME}${NC}"
    aws cloudformation create-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://main.yaml \
        --parameters file://${PARAM_FILE} \
        --capabilities CAPABILITY_NAMED_IAM \
        --region ${REGION} \
        --tags \
            Key=Environment,Value=${ENVIRONMENT} \
            Key=Project,Value=Complens \
            Key=ManagedBy,Value=CloudFormation

    echo -e "${YELLOW}Waiting for stack creation to complete...${NC}"
    aws cloudformation wait stack-create-complete \
        --stack-name ${STACK_NAME} \
        --region ${REGION}
else
    # Update existing stack
    echo -e "${GREEN}Updating existing stack: ${STACK_NAME}${NC}"
    UPDATE_OUTPUT=$(aws cloudformation update-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://main.yaml \
        --parameters file://${PARAM_FILE} \
        --capabilities CAPABILITY_NAMED_IAM \
        --region ${REGION} 2>&1 || true)

    if echo "$UPDATE_OUTPUT" | grep -q "No updates are to be performed"; then
        echo -e "${YELLOW}No updates needed - stack is already up to date${NC}"
    else
        echo -e "${YELLOW}Waiting for stack update to complete...${NC}"
        aws cloudformation wait stack-update-complete \
            --stack-name ${STACK_NAME} \
            --region ${REGION}
    fi
fi

# Display stack outputs
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Stack Outputs${NC}"
echo -e "${GREEN}========================================${NC}"
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table

echo ""
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Update the database password in Secrets Manager if using default"
echo -e "2. Build and deploy your Lambda functions"
echo -e "3. Build and deploy your React frontend to the S3 bucket"
echo -e "4. Configure custom domain in CloudFront (optional)"
