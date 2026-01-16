<#
.SYNOPSIS
    Quick Lambda deployment for Complens.ai

.DESCRIPTION
    Deploys just the Lambda function code - fastest way to push code changes.

.PARAMETER Environment
    Target environment: 'dev' or 'prod' (default: dev)

.EXAMPLE
    .\Deploy-Lambda.ps1
    .\Deploy-Lambda.ps1 -Environment prod
#>

param(
    [ValidateSet('dev', 'prod')]
    [string]$Environment = 'dev'
)

$ErrorActionPreference = 'Stop'
$Region = 'us-east-1'
$StackName = "complens-$Environment"
$FunctionName = "$Environment-complens-api"

Write-Host ""
Write-Host "Quick Lambda Deploy - $Environment" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Get account ID
$AccountId = aws sts get-caller-identity --query Account --output text --region $Region
Write-Host "Account: $AccountId"

# Get Lambda bucket
$LambdaBucket = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaCodeBucketName`].OutputValue' `
    --output text --region $Region 2>$null

if (-not $LambdaBucket -or $LambdaBucket -eq "None") {
    $LambdaBucket = "$AccountId-$Environment-complens-lambda-code"
}

Write-Host "Bucket: $LambdaBucket"
Write-Host ""

# Navigate to Lambda directory
$LambdaDir = Join-Path $PSScriptRoot "..\backend\lambda\api"
Push-Location $LambdaDir

try {
    # Clean install
    Write-Host "[1/5] Installing dependencies..." -ForegroundColor Yellow
    if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
    npm install --production --silent 2>&1 | Out-Null

    # Create zip
    Write-Host "[2/5] Creating package..." -ForegroundColor Yellow
    $ZipFile = Join-Path $env:TEMP "lambda-deploy.zip"
    if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }

    # Use 7-Zip if available (faster), otherwise Compress-Archive
    $7z = "C:\Program Files\7-Zip\7z.exe"
    if (Test-Path $7z) {
        & $7z a -tzip $ZipFile * -xr!.git -xr!tests -xr!*.md -xr!.gitignore 2>&1 | Out-Null
    } else {
        Get-ChildItem -Path . -Exclude @('.git', 'tests', '*.md', '.gitignore') |
            Compress-Archive -DestinationPath $ZipFile -Force
    }

    $SizeMB = [math]::Round((Get-Item $ZipFile).Length / 1MB, 2)
    Write-Host "       Package size: $SizeMB MB"

    # Upload to S3
    Write-Host "[3/5] Uploading to S3..." -ForegroundColor Yellow
    aws s3 cp $ZipFile "s3://$LambdaBucket/api/latest.zip" --region $Region | Out-Null

    # Update Lambda
    Write-Host "[4/5] Updating Lambda function..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name $FunctionName `
        --s3-bucket $LambdaBucket `
        --s3-key "api/latest.zip" `
        --region $Region | Out-Null

    # Wait for update
    Write-Host "[5/5] Waiting for deployment..." -ForegroundColor Yellow
    aws lambda wait function-updated --function-name $FunctionName --region $Region

    # Cleanup
    Remove-Item $ZipFile -Force -ErrorAction SilentlyContinue

    # Get API URL
    $ApiUrl = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayURL`].OutputValue' `
        --output text --region $Region

    Write-Host ""
    Write-Host "Done!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test: curl $ApiUrl/health" -ForegroundColor Yellow
    Write-Host ""

} finally {
    Pop-Location
}
