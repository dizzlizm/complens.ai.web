#!/bin/bash
set -e

# Complens.ai Full Deployment Script
# Usage: ./scripts/deploy.sh [stage]
# Example: ./scripts/deploy.sh dev

STAGE="${1:-dev}"
STACK_NAME="complens-${STAGE}"

echo "============================================"
echo "Complens.ai Deployment - Stage: ${STAGE}"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    if ! command -v sam &> /dev/null; then
        log_error "SAM CLI not found. Install it: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
        exit 1
    fi

    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Install it: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        log_error "npm not found. Install Node.js: https://nodejs.org/"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi

    log_info "All prerequisites met!"
}

# Build SAM application
build_backend() {
    log_step "Building SAM application..."
    sam build --cached --parallel
    log_info "Backend build complete!"
}

# Deploy SAM application
deploy_backend() {
    log_step "Deploying backend to AWS (${STAGE})..."
    # Allow "no changes" to not fail the script
    set +e
    sam deploy --config-env "${STAGE}" --no-confirm-changeset 2>&1 | tee /tmp/sam-deploy.log
    DEPLOY_EXIT=${PIPESTATUS[0]}
    set -e

    if [ $DEPLOY_EXIT -ne 0 ]; then
        if grep -q "No changes to deploy" /tmp/sam-deploy.log; then
            log_info "No backend changes to deploy (this is OK)"
        else
            log_error "SAM deploy failed!"
            exit 1
        fi
    fi
    log_info "Backend deployment complete!"
}

# Get stack outputs
get_stack_outputs() {
    log_step "Fetching stack outputs..."

    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
        --output text 2>/dev/null)

    CLIENT_ID=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
        --output text 2>/dev/null)

    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='RestApiCustomUrl'].OutputValue" \
        --output text 2>/dev/null)

    if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
        API_URL=$(aws cloudformation describe-stacks \
            --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='RestApiUrl'].OutputValue" \
            --output text 2>/dev/null)
    fi

    FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
        --output text 2>/dev/null)

    DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendDistributionId'].OutputValue" \
        --output text 2>/dev/null)

    FRONTEND_URL=$(aws cloudformation describe-stacks \
        --stack-name "${STACK_NAME}" \
        --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
        --output text 2>/dev/null)

    log_info "Stack outputs retrieved!"
}

# Generate frontend environment file
generate_frontend_env() {
    log_step "Generating frontend environment file..."

    # Validate required values
    if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ]; then
        log_error "USER_POOL_ID is empty! Stack outputs may not be ready."
        log_info "Trying to fetch again..."
        USER_POOL_ID=$(aws cloudformation describe-stacks \
            --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
            --output text)
    fi

    if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
        log_error "CLIENT_ID is empty! Stack outputs may not be ready."
        log_info "Trying to fetch again..."
        CLIENT_ID=$(aws cloudformation describe-stacks \
            --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
            --output text)
    fi

    # Final validation
    if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" = "None" ] || [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" = "None" ]; then
        log_error "Failed to get Cognito configuration from stack outputs!"
        log_error "USER_POOL_ID: ${USER_POOL_ID:-EMPTY}"
        log_error "CLIENT_ID: ${CLIENT_ID:-EMPTY}"
        exit 1
    fi

    # Write the env file
    echo "VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}" > web/.env.local
    echo "VITE_COGNITO_CLIENT_ID=${CLIENT_ID}" >> web/.env.local
    echo "VITE_API_URL=${API_URL}" >> web/.env.local

    # Verify file was created
    if [ ! -f "web/.env.local" ]; then
        log_error "FAILED TO CREATE web/.env.local!"
        exit 1
    fi

    log_info "Created web/.env.local:"
    echo "----------------------------------------"
    cat web/.env.local
    echo "----------------------------------------"

    # Double check the values are in the file
    if ! grep -q "VITE_COGNITO_USER_POOL_ID=us-east" web/.env.local; then
        log_error "web/.env.local does not contain valid USER_POOL_ID!"
        exit 1
    fi

    log_info "Environment file verified!"
}

# Install frontend dependencies
install_frontend_deps() {
    log_step "Installing frontend dependencies..."
    cd web
    npm install
    cd ..
    log_info "Frontend dependencies installed!"
}

# Build frontend
build_frontend() {
    log_step "Building frontend..."
    cd web
    npm run build
    cd ..
    log_info "Frontend build complete!"
}

# Deploy frontend to S3
deploy_frontend() {
    log_step "Deploying frontend to S3..."

    if [ -z "$FRONTEND_BUCKET" ] || [ "$FRONTEND_BUCKET" = "None" ]; then
        log_error "Frontend bucket not found. Make sure EnableCustomDomain=true in your deployment."
        exit 1
    fi

    log_info "Syncing to s3://${FRONTEND_BUCKET}..."
    aws s3 sync web/dist/ "s3://${FRONTEND_BUCKET}/" --delete

    log_info "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "${DISTRIBUTION_ID}" \
        --paths "/*" \
        --output text

    log_info "Frontend deployed!"
}

# Print summary
print_summary() {
    echo ""
    echo "============================================"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo "============================================"
    echo ""
    echo "Endpoints:"
    echo "  Frontend:  ${FRONTEND_URL:-'N/A (custom domain not enabled)'}"
    echo "  API:       ${API_URL}"
    echo ""
    echo "Cognito:"
    echo "  User Pool ID: ${USER_POOL_ID}"
    echo "  Client ID:    ${CLIENT_ID}"
    echo ""
    echo "AWS Resources:"
    echo "  S3 Bucket:       ${FRONTEND_BUCKET:-'N/A'}"
    echo "  CloudFront ID:   ${DISTRIBUTION_ID:-'N/A'}"
    echo ""

    if [ -n "$FRONTEND_URL" ] && [ "$FRONTEND_URL" != "None" ]; then
        echo -e "${GREEN}Your app is live at: ${FRONTEND_URL}${NC}"
    fi
    echo ""
}

# Main execution
main() {
    cd "$(dirname "$0")/.."

    check_prerequisites
    build_backend
    deploy_backend
    get_stack_outputs
    generate_frontend_env
    install_frontend_deps
    build_frontend
    deploy_frontend
    print_summary
}

# Run main
main
