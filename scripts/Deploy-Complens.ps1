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

$ErrorActionPreference = 'Continue'  # Don't stop on errors, we'll handle them
$StackName = "complens-$Environment"

# Colors for output
function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "    [FAIL] $msg" -ForegroundColor Red }

# Helper to run AWS CLI and check result
function Invoke-AwsCli {
    param(
        [string]$Command,
        [string]$Description,
        [switch]$Silent,
        [switch]$AllowFailure
    )

    Write-Host "    $Description..." -NoNewline

    $result = Invoke-Expression "aws $Command 2>&1"
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        if ($AllowFailure) {
            Write-Host " (skipped)" -ForegroundColor Yellow
            return @{ Success = $false; Output = $result; ExitCode = $exitCode }
        }
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "    Error: $result" -ForegroundColor Red
        return @{ Success = $false; Output = $result; ExitCode = $exitCode }
    }

    if (-not $Silent) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host ""
    }
    return @{ Success = $true; Output = $result; ExitCode = 0 }
}

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
$awsVersion = aws --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "AWS CLI not found. Install from: https://aws.amazon.com/cli/"
    exit 1
}
Write-Success "AWS CLI: $awsVersion"

# Check AWS credentials and get account ID
Write-Step "Checking AWS credentials..."
$script:AccountId = aws sts get-caller-identity --query Account --output text --region $Region 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "AWS credentials not configured. Run: aws configure"
    exit 1
}
$identity = aws sts get-caller-identity --query Arn --output text --region $Region
Write-Success "Account: $script:AccountId"
Write-Success "Identity: $identity"

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

    $cfnDir = Join-Path $PSScriptRoot "..\infrastructure\cloudformation" | Resolve-Path
    $templateFile = Join-Path $cfnDir "main.yaml"
    $paramFile = Join-Path $cfnDir "parameters\$Environment.json"

    # Verify files exist
    if (-not (Test-Path $templateFile)) {
        Write-Fail "Template not found: $templateFile"
        exit 1
    }
    if (-not (Test-Path $paramFile)) {
        Write-Fail "Parameters not found: $paramFile"
        exit 1
    }

    $lambdaBucket = "$script:AccountId-$Environment-complens-lambda-code"
    Write-Host "    Lambda bucket: $lambdaBucket"

    # Check if bucket exists
    Write-Host "    Checking if bucket exists..." -NoNewline
    $bucketCheck = aws s3api head-bucket --bucket $lambdaBucket --region $Region 2>&1
    $bucketExists = ($LASTEXITCODE -eq 0)

    if ($bucketExists) {
        Write-Host " exists" -ForegroundColor Green
    } else {
        Write-Host " not found, creating..." -ForegroundColor Yellow

        # Create bucket
        $createResult = aws s3 mb "s3://$lambdaBucket" --region $Region 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Failed to create bucket: $createResult"
            exit 1
        }
        Write-Success "Bucket created"

        # Configure bucket
        Write-Host "    Configuring bucket versioning..." -NoNewline
        aws s3api put-bucket-versioning --bucket $lambdaBucket --versioning-configuration Status=Enabled --region $Region 2>&1 | Out-Null
        Write-Host " OK" -ForegroundColor Green

        Write-Host "    Blocking public access..." -NoNewline
        aws s3api put-public-access-block --bucket $lambdaBucket `
            --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" `
            --region $Region 2>&1 | Out-Null
        Write-Host " OK" -ForegroundColor Green
    }

    # Upload template to S3
    Write-Host "    Uploading CloudFormation template..." -NoNewline
    $uploadResult = aws s3 cp $templateFile "s3://$lambdaBucket/cfn/main.yaml" --region $Region 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Fail "Upload failed: $uploadResult"
        exit 1
    }
    Write-Host " OK" -ForegroundColor Green

    $templateUrl = "https://$lambdaBucket.s3.$Region.amazonaws.com/cfn/main.yaml"

    # Validate template
    Write-Host "    Validating template..." -NoNewline
    $validateResult = aws cloudformation validate-template --template-url $templateUrl --region $Region 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Fail "Validation failed: $validateResult"
        exit 1
    }
    Write-Host " OK" -ForegroundColor Green

    # Check for placeholder Lambda code
    Write-Host "    Checking for Lambda code..." -NoNewline
    $codeCheck = aws s3api head-object --bucket $lambdaBucket --key "api/latest.zip" --region $Region 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " not found" -ForegroundColor Yellow
        $placeholderPath = Join-Path $cfnDir "..\lambda-placeholder.zip"
        if (Test-Path $placeholderPath) {
            Write-Host "    Uploading placeholder Lambda..." -NoNewline
            aws s3 cp $placeholderPath "s3://$lambdaBucket/api/latest.zip" --region $Region 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host " OK" -ForegroundColor Green
            } else {
                Write-Host " FAILED (non-critical)" -ForegroundColor Yellow
            }
        } else {
            Write-Warn "No placeholder found at $placeholderPath"
        }
    } else {
        Write-Host " exists" -ForegroundColor Green
    }

    # Read parameters
    $params = Get-Content $paramFile -Raw -Encoding UTF8

    # Check if stack exists
    Write-Host "    Checking stack status..." -NoNewline
    $stackCheck = aws cloudformation describe-stacks --stack-name $StackName --region $Region 2>&1
    $stackExists = ($LASTEXITCODE -eq 0)

    if ($stackExists) {
        Write-Host " exists, updating" -ForegroundColor Green

        # Update stack
        Write-Host "    Updating stack..." -NoNewline
        $updateResult = aws cloudformation update-stack `
            --stack-name $StackName `
            --template-url $templateUrl `
            --parameters $params `
            --capabilities CAPABILITY_NAMED_IAM `
            --region $Region 2>&1

        if ($LASTEXITCODE -ne 0) {
            if ($updateResult -match "No updates are to be performed") {
                Write-Host " no changes" -ForegroundColor Green
                Write-Success "Stack is already up to date"
            } else {
                Write-Host " FAILED" -ForegroundColor Red
                Write-Fail "Update failed: $updateResult"
                exit 1
            }
        } else {
            Write-Host " initiated" -ForegroundColor Green
            Write-Host "    Waiting for stack update (5-15 min)..." -ForegroundColor Yellow
            aws cloudformation wait stack-update-complete --stack-name $StackName --region $Region
            if ($LASTEXITCODE -ne 0) {
                Write-Fail "Stack update failed. Check CloudFormation console."
                exit 1
            }
            Write-Success "Stack updated successfully"
        }
    } else {
        Write-Host " not found, creating" -ForegroundColor Yellow

        # Create stack
        Write-Host "    Creating stack..." -NoNewline
        $createResult = aws cloudformation create-stack `
            --stack-name $StackName `
            --template-url $templateUrl `
            --parameters $params `
            --capabilities CAPABILITY_NAMED_IAM `
            --region $Region `
            --tags Key=Environment,Value=$Environment Key=Project,Value=Complens 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "Create failed: $createResult"
            exit 1
        }
        Write-Host " initiated" -ForegroundColor Green

        Write-Host "    Waiting for stack creation (15-30 min)..." -ForegroundColor Yellow
        aws cloudformation wait stack-create-complete --stack-name $StackName --region $Region
        if ($LASTEXITCODE -ne 0) {
            Write-Fail "Stack creation failed. Check CloudFormation console."
            exit 1
        }
        Write-Success "Stack created successfully"
    }

    # Show outputs
    Write-Host ""
    Write-Host "    Stack Outputs:" -ForegroundColor Cyan
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

    $lambdaDir = Join-Path $PSScriptRoot "..\backend\lambda\api" | Resolve-Path
    $functionName = "$Environment-complens-api"

    # Get Lambda bucket from stack or use default
    $lambdaBucket = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`LambdaCodeBucketName`].OutputValue' `
        --output text `
        --region $Region 2>&1

    if ($LASTEXITCODE -ne 0 -or -not $lambdaBucket -or $lambdaBucket -eq "None") {
        $lambdaBucket = "$script:AccountId-$Environment-complens-lambda-code"
        Write-Warn "Using default bucket: $lambdaBucket"
    } else {
        Write-Host "    Lambda bucket: $lambdaBucket"
    }

    Push-Location $lambdaDir
    try {
        # Install dependencies
        Write-Host "    Installing dependencies..." -NoNewline
        if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
        $npmResult = npm install --production 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "npm install failed: $npmResult"
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        # Create zip
        Write-Host "    Creating deployment package..." -NoNewline
        $zipFile = Join-Path $env:TEMP "complens-api-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"

        if (Test-Path $zipFile) { Remove-Item $zipFile -Force }

        # Use Compress-Archive
        Get-ChildItem -Path . -Exclude @('.git', 'tests', '*.md', '.gitignore') |
            Compress-Archive -DestinationPath $zipFile -Force

        $zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
        Write-Host " OK ($zipSize MB)" -ForegroundColor Green

        # Upload to S3
        Write-Host "    Uploading to S3..." -NoNewline
        $uploadResult = aws s3 cp $zipFile "s3://$lambdaBucket/api/latest.zip" --region $Region 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "Upload failed: $uploadResult"
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        # Update Lambda function
        Write-Host "    Updating Lambda function..." -NoNewline
        $updateResult = aws lambda update-function-code `
            --function-name $functionName `
            --s3-bucket $lambdaBucket `
            --s3-key "api/latest.zip" `
            --region $Region 2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "Lambda update failed: $updateResult"
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        # Wait for update
        Write-Host "    Waiting for deployment..." -NoNewline
        aws lambda wait function-updated --function-name $functionName --region $Region 2>&1 | Out-Null
        Write-Host " OK" -ForegroundColor Green

        # Cleanup
        Remove-Item $zipFile -Force -ErrorAction SilentlyContinue

        Write-Success "Lambda function updated"

    } finally {
        Pop-Location
    }

    # Get API URL
    $apiUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' `
        --output text `
        --region $Region 2>&1

    if ($LASTEXITCODE -eq 0 -and $apiUrl) {
        Write-Host ""
        Write-Host "    Test: curl $apiUrl/health" -ForegroundColor Yellow
    }
}

# ============================================================================
# Frontend Deployment
# ============================================================================
function Deploy-Frontend {
    Write-Step "Deploying React frontend..."

    $frontendDir = Join-Path $PSScriptRoot "..\frontend" | Resolve-Path

    # Get stack outputs
    Write-Host "    Getting stack outputs..." -NoNewline
    $apiUrl = aws cloudformation describe-stacks --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' --output text --region $Region 2>&1
    $frontendBucket = aws cloudformation describe-stacks --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text --region $Region 2>&1
    $cognitoPoolId = aws cloudformation describe-stacks --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text --region $Region 2>&1
    $cognitoClientId = aws cloudformation describe-stacks --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolClientId`].OutputValue' --output text --region $Region 2>&1
    $cloudfrontUrl = aws cloudformation describe-stacks --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' --output text --region $Region 2>&1

    if (-not $frontendBucket -or $frontendBucket -eq "None") {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Fail "Could not get frontend bucket from stack outputs"
        exit 1
    }
    Write-Host " OK" -ForegroundColor Green

    Write-Host "    API URL: $apiUrl"
    Write-Host "    Frontend Bucket: $frontendBucket"
    Write-Host "    Cognito Pool: $cognitoPoolId"

    Push-Location $frontendDir
    try {
        # Install dependencies
        Write-Host "    Installing dependencies..." -NoNewline
        $npmResult = npm install 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "npm install failed"
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        # Set environment and build
        Write-Host "    Building React app..." -NoNewline
        $env:REACT_APP_API_URL = $apiUrl
        $env:REACT_APP_COGNITO_USER_POOL_ID = $cognitoPoolId
        $env:REACT_APP_COGNITO_CLIENT_ID = $cognitoClientId
        $env:REACT_APP_AWS_REGION = $Region

        $buildResult = npm run build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            Write-Fail "Build failed: $buildResult"
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        # Upload to S3
        Write-Host "    Uploading to S3..." -NoNewline
        aws s3 sync build/ "s3://$frontendBucket/" --delete --region $Region `
            --cache-control "public,max-age=31536000,immutable" --exclude "index.html" 2>&1 | Out-Null

        aws s3 cp build/index.html "s3://$frontendBucket/index.html" --region $Region `
            --cache-control "public,max-age=0,must-revalidate" --content-type "text/html" 2>&1 | Out-Null

        if ($LASTEXITCODE -ne 0) {
            Write-Host " FAILED" -ForegroundColor Red
            exit 1
        }
        Write-Host " OK" -ForegroundColor Green

        Write-Success "Frontend deployed"

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
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    Write-Host ""
    Write-Host "Check CloudFormation console:" -ForegroundColor Yellow
    Write-Host "https://console.aws.amazon.com/cloudformation/home?region=$Region#/stacks" -ForegroundColor Yellow
    exit 1
}
