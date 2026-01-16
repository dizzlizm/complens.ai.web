<#
.SYNOPSIS
    Complens.ai Deployment Script for Windows

.DESCRIPTION
    Deploys infrastructure, backend Lambda, and/or frontend to AWS.
    Supports both dev and prod environments.

.PARAMETER Environment
    Target environment: 'dev' or 'prod' (default: dev)

.PARAMETER Component
    What to deploy: 'all', 'infra', 'backend', 'frontend' (default: all)

.PARAMETER Region
    AWS region (default: us-east-1)

.PARAMETER SkipConfirm
    Skip confirmation prompts

.EXAMPLE
    # Deploy everything to dev
    .\Deploy-Complens.ps1 -Environment dev

    # Deploy only Lambda to prod
    .\Deploy-Complens.ps1 -Environment prod -Component backend

    # Deploy infrastructure only
    .\Deploy-Complens.ps1 -Component infra
#>

param(
    [ValidateSet('dev', 'prod')]
    [string]$Environment = 'dev',

    [ValidateSet('all', 'infra', 'backend', 'frontend')]
    [string]$Component = 'all',

    [string]$Region = 'us-east-1',

    [switch]$SkipConfirm
)

$ErrorActionPreference = 'Stop'
$StackName = "complens-$Environment"

# Colors for output
function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warning { param($msg) Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "    [FAIL] $msg" -ForegroundColor Red }

# ============================================================================
# Pre-flight checks
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Complens.ai Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Environment: $Environment" -ForegroundColor Yellow
Write-Host "  Component:   $Component" -ForegroundColor Yellow
Write-Host "  Region:      $Region" -ForegroundColor Yellow
Write-Host "  Stack:       $StackName" -ForegroundColor Yellow
Write-Host ""

# Check AWS CLI
Write-Step "Checking AWS CLI..."
try {
    $awsVersion = aws --version 2>&1
    Write-Success "AWS CLI: $awsVersion"
} catch {
    Write-Fail "AWS CLI not found. Install from: https://aws.amazon.com/cli/"
    exit 1
}

# Check AWS credentials
Write-Step "Checking AWS credentials..."
try {
    $accountId = aws sts get-caller-identity --query Account --output text --region $Region
    $identity = aws sts get-caller-identity --query Arn --output text --region $Region
    Write-Success "Account: $accountId"
    Write-Success "Identity: $identity"
} catch {
    Write-Fail "AWS credentials not configured. Run: aws configure"
    exit 1
}

# Confirm deployment
if (-not $SkipConfirm) {
    Write-Host ""
    $confirm = Read-Host "Deploy $Component to $Environment? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# ============================================================================
# Infrastructure Deployment
# ============================================================================
function Deploy-Infrastructure {
    Write-Step "Deploying CloudFormation infrastructure..."

    $cfnDir = Join-Path $PSScriptRoot "..\infrastructure\cloudformation"
    $templateFile = Join-Path $cfnDir "main.yaml"
    $paramFile = Join-Path $cfnDir "parameters\$Environment.json"

    # Validate template
    Write-Host "    Validating template..."
    aws cloudformation validate-template `
        --template-body "file://$templateFile" `
        --region $Region | Out-Null
    Write-Success "Template valid"

    # Check if stack exists
    $stackExists = $false
    try {
        aws cloudformation describe-stacks --stack-name $StackName --region $Region 2>&1 | Out-Null
        $stackExists = $true
    } catch {}

    # Ensure Lambda code bucket exists
    $lambdaBucket = "$accountId-$Environment-complens-lambda-code"
    Write-Host "    Checking Lambda bucket: $lambdaBucket"

    $bucketExists = (aws s3 ls "s3://$lambdaBucket" --region $Region 2>&1) -notmatch "NoSuchBucket"
    if (-not $bucketExists) {
        Write-Host "    Creating Lambda bucket..."
        aws s3 mb "s3://$lambdaBucket" --region $Region
        aws s3api put-bucket-versioning --bucket $lambdaBucket --versioning-configuration Status=Enabled --region $Region
        aws s3api put-public-access-block --bucket $lambdaBucket `
            --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
            --region $Region
    }

    # Check for placeholder Lambda
    $hasCode = (aws s3 ls "s3://$lambdaBucket/api/latest.zip" --region $Region 2>&1) -notmatch "NoSuchKey"
    if (-not $hasCode) {
        $placeholderPath = Join-Path $cfnDir "..\lambda-placeholder.zip"
        if (Test-Path $placeholderPath) {
            Write-Host "    Uploading placeholder Lambda..."
            aws s3 cp $placeholderPath "s3://$lambdaBucket/api/latest.zip" --region $Region
        }
    }

    # Read parameters
    $params = Get-Content $paramFile -Raw

    if ($stackExists) {
        Write-Host "    Updating existing stack..."
        try {
            aws cloudformation update-stack `
                --stack-name $StackName `
                --template-body "file://$templateFile" `
                --parameters $params `
                --capabilities CAPABILITY_NAMED_IAM `
                --region $Region

            Write-Host "    Waiting for stack update (this may take 5-15 minutes)..."
            aws cloudformation wait stack-update-complete --stack-name $StackName --region $Region
            Write-Success "Stack updated"
        } catch {
            if ($_ -match "No updates are to be performed") {
                Write-Success "Stack already up to date"
            } else {
                throw $_
            }
        }
    } else {
        Write-Host "    Creating new stack..."
        aws cloudformation create-stack `
            --stack-name $StackName `
            --template-body "file://$templateFile" `
            --parameters $params `
            --capabilities CAPABILITY_NAMED_IAM `
            --region $Region `
            --tags Key=Environment,Value=$Environment Key=Project,Value=Complens

        Write-Host "    Waiting for stack creation (this may take 15-30 minutes)..."
        aws cloudformation wait stack-create-complete --stack-name $StackName --region $Region
        Write-Success "Stack created"
    }

    # Show outputs
    Write-Host ""
    Write-Host "Stack Outputs:" -ForegroundColor Cyan
    aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' `
        --output table
}

# ============================================================================
# Backend Deployment
# ============================================================================
function Deploy-Backend {
    Write-Step "Deploying Lambda backend..."

    $lambdaDir = Join-Path $PSScriptRoot "..\backend\lambda\api"
    $functionName = "$Environment-complens-api"

    # Get Lambda bucket from stack
    $lambdaBucket = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaCodeBucketName`].OutputValue' `
        --output text `
        --region $Region

    if (-not $lambdaBucket -or $lambdaBucket -eq "None") {
        $lambdaBucket = "$accountId-$Environment-complens-lambda-code"
    }

    Write-Host "    Lambda bucket: $lambdaBucket"

    # Install dependencies
    Write-Host "    Installing dependencies..."
    Push-Location $lambdaDir
    try {
        if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
        if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }
        npm install --production --silent 2>&1 | Out-Null
        Write-Success "Dependencies installed"

        # Create zip
        Write-Host "    Creating deployment package..."
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $zipFile = Join-Path $env:TEMP "complens-api-$timestamp.zip"

        # Use Compress-Archive (built into PowerShell 5+)
        $excludes = @('.git', '.gitignore', 'tests', '*.md', 'node_modules\.cache')
        Get-ChildItem -Path . -Exclude $excludes | Compress-Archive -DestinationPath $zipFile -Force

        $zipSize = (Get-Item $zipFile).Length / 1MB
        Write-Success "Package created: $([math]::Round($zipSize, 2)) MB"

        # Upload to S3
        Write-Host "    Uploading to S3..."
        aws s3 cp $zipFile "s3://$lambdaBucket/api/latest.zip" --region $Region
        Write-Success "Uploaded to S3"

        # Update Lambda function
        Write-Host "    Updating Lambda function..."
        aws lambda update-function-code `
            --function-name $functionName `
            --s3-bucket $lambdaBucket `
            --s3-key "api/latest.zip" `
            --region $Region | Out-Null

        Write-Host "    Waiting for update..."
        aws lambda wait function-updated --function-name $functionName --region $Region
        Write-Success "Lambda function updated"

        # Cleanup
        Remove-Item $zipFile -Force

    } finally {
        Pop-Location
    }

    # Get API URL
    $apiUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' `
        --output text `
        --region $Region

    Write-Host ""
    Write-Host "    Test with: curl $apiUrl/health" -ForegroundColor Yellow
}

# ============================================================================
# Frontend Deployment
# ============================================================================
function Deploy-Frontend {
    Write-Step "Deploying React frontend..."

    $frontendDir = Join-Path $PSScriptRoot "..\frontend"

    # Get stack outputs
    $apiUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' `
        --output text --region $Region

    $frontendBucket = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' `
        --output text --region $Region

    $cognitoPoolId = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' `
        --output text --region $Region

    $cognitoClientId = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolClientId`].OutputValue' `
        --output text --region $Region

    Write-Host "    API URL: $apiUrl"
    Write-Host "    Frontend Bucket: $frontendBucket"
    Write-Host "    Cognito Pool: $cognitoPoolId"

    Push-Location $frontendDir
    try {
        # Install dependencies
        Write-Host "    Installing dependencies..."
        npm install --silent 2>&1 | Out-Null
        Write-Success "Dependencies installed"

        # Build with environment variables
        Write-Host "    Building React app..."
        $env:REACT_APP_API_URL = $apiUrl
        $env:REACT_APP_COGNITO_USER_POOL_ID = $cognitoPoolId
        $env:REACT_APP_COGNITO_CLIENT_ID = $cognitoClientId
        $env:REACT_APP_AWS_REGION = $Region

        npm run build 2>&1 | Out-Null
        Write-Success "Build complete"

        # Upload to S3
        Write-Host "    Uploading to S3..."
        aws s3 sync build/ "s3://$frontendBucket/" `
            --delete `
            --region $Region `
            --cache-control "public,max-age=31536000,immutable" `
            --exclude "index.html"

        # Upload index.html with no cache
        aws s3 cp build/index.html "s3://$frontendBucket/index.html" `
            --region $Region `
            --cache-control "public,max-age=0,must-revalidate" `
            --content-type "text/html"

        Write-Success "Uploaded to S3"

        # Invalidate CloudFront (optional)
        Write-Host "    Invalidating CloudFront cache..."
        $cloudfrontUrl = aws cloudformation describe-stacks `
            --stack-name $StackName `
            --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' `
            --output text --region $Region

        # Try to find distribution ID
        $distributions = aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName]" --output json | ConvertFrom-Json
        foreach ($dist in $distributions) {
            if ($cloudfrontUrl -match $dist[1]) {
                aws cloudfront create-invalidation --distribution-id $dist[0] --paths "/*" | Out-Null
                Write-Success "CloudFront cache invalidated"
                break
            }
        }

    } finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "    Frontend URL: $cloudfrontUrl" -ForegroundColor Yellow
}

# ============================================================================
# Main Execution
# ============================================================================
$startTime = Get-Date

try {
    switch ($Component) {
        'all' {
            Deploy-Infrastructure
            Deploy-Backend
            Deploy-Frontend
        }
        'infra' { Deploy-Infrastructure }
        'backend' { Deploy-Backend }
        'frontend' { Deploy-Frontend }
    }

    $elapsed = (Get-Date) - $startTime
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Deployment Complete!" -ForegroundColor Green
    Write-Host "  Time: $([math]::Round($elapsed.TotalMinutes, 1)) minutes" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Fail "Deployment failed: $_"
    Write-Host ""
    Write-Host "Check CloudFormation console for details:" -ForegroundColor Yellow
    Write-Host "https://console.aws.amazon.com/cloudformation/home?region=$Region#/stacks" -ForegroundColor Yellow
    exit 1
}
