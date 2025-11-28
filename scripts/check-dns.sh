#!/bin/bash
# Check Route53 DNS records for complens.ai

ZONE_ID="/hostedzone/Z02373573N3XBHSZBERY6"
REGION="us-east-1"

echo "🔍 Checking Route53 DNS Records for complens.ai"
echo "================================================"
echo ""

# List all records in the zone
echo "📍 All DNS Records in Zone:"
aws route53 list-resource-record-sets \
  --hosted-zone-id ${ZONE_ID} \
  --query 'ResourceRecordSets[*].[Name,Type,AliasTarget.DNSName]' \
  --output table

echo ""
echo "🎯 Looking for dev.complens.ai record:"

# Check specifically for dev.complens.ai
DEV_RECORD=$(aws route53 list-resource-record-sets \
  --hosted-zone-id ${ZONE_ID} \
  --query "ResourceRecordSets[?Name=='dev.complens.ai.']" \
  --output json)

if [ "$DEV_RECORD" != "[]" ]; then
  echo "✅ dev.complens.ai record FOUND!"
  echo ""
  echo "Details:"
  echo "$DEV_RECORD" | jq .
else
  echo "❌ dev.complens.ai record NOT FOUND"
  echo ""
  echo "This means CloudFormation hasn't created it yet."
  echo ""
  echo "Possible reasons:"
  echo "1. Stack is still deploying"
  echo "2. ACM certificate is pending validation"
  echo "3. Stack deployment failed"
  echo ""
  echo "Check stack status:"
  echo "  aws cloudformation describe-stacks --stack-name complens-dev --region us-east-1"
fi

echo ""
echo "================================================"
echo "💡 Test DNS Resolution:"
echo ""

if command -v dig &> /dev/null; then
  echo "Using 'dig' to check DNS:"
  dig dev.complens.ai +short
  echo ""

  if dig dev.complens.ai +short | grep -q "."; then
    echo "✅ dev.complens.ai resolves!"
  else
    echo "⏳ dev.complens.ai doesn't resolve yet (propagation takes time)"
  fi
else
  echo "⚠️  'dig' not installed. Install with: brew install bind (macOS) or apt-get install dnsutils (Linux)"
fi

echo ""
