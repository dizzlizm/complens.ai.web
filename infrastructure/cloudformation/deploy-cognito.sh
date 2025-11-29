#!/bin/bash

# Deploy Cognito User Pool standalone
# Usage: ./deploy-cognito.sh dev

set -e

ENV=${1:-dev}
STACK_NAME="complens-cognito-${ENV}"
REGION="us-east-1"

echo "Deploying Cognito stack: ${STACK_NAME}"
echo "Environment: ${ENV}"
echo "Region: ${REGION}"
echo ""

# Check if stack exists
if aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} 2>&1 | grep -q "does not exist"; then
    echo "Creating new Cognito stack..."
    aws cloudformation create-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://cognito-only.yaml \
        --parameters ParameterKey=Environment,ParameterValue=${ENV} \
        --region ${REGION} \
        --tags \
            Key=Environment,Value=${ENV} \
            Key=Project,Value=Complens \
            Key=Component,Value=Authentication

    echo "Waiting for stack creation..."
    aws cloudformation wait stack-create-complete \
        --stack-name ${STACK_NAME} \
        --region ${REGION}
else
    echo "Updating existing Cognito stack..."
    aws cloudformation update-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://cognito-only.yaml \
        --parameters ParameterKey=Environment,ParameterValue=${ENV} \
        --region ${REGION} 2>&1 || true

    echo "Waiting for stack update..."
    aws cloudformation wait stack-update-complete \
        --stack-name ${STACK_NAME} \
        --region ${REGION} 2>&1 || true
fi

echo ""
echo "✅ Cognito deployment complete!"
echo ""
echo "Outputs:"
aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' \
    --output table

echo ""
echo "Copy these values to your frontend .env:"
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text)

echo "REACT_APP_COGNITO_USER_POOL_ID=${USER_POOL_ID}"
echo "REACT_APP_COGNITO_CLIENT_ID=${CLIENT_ID}"
echo "REACT_APP_AWS_REGION=${REGION}"
