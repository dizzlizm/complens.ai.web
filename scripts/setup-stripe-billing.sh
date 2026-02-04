#!/usr/bin/env bash
# Create Stripe products and prices for Complens.ai platform billing.
# Usage: ./scripts/setup-stripe-billing.sh

set -euo pipefail

STRIPE_KEY="${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY env var}"
API="https://api.stripe.com/v1"

stripe_post() {
  local endpoint="$1"
  shift
  curl -s -X POST "$API/$endpoint" \
    -u "$STRIPE_KEY:" \
    "$@"
}

echo "=== Creating Stripe products and prices ==="
echo ""

# --- Pro Plan ---
echo "Creating Pro product..."
PRO_PRODUCT=$(stripe_post "products" \
  -d "name=Complens.ai Pro" \
  -d "description=Everything you need to grow — 10K contacts, 25 pages, 50 workflows" \
  -d "metadata[plan]=pro")

PRO_PRODUCT_ID=$(echo "$PRO_PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Product: $PRO_PRODUCT_ID"

echo "Creating Pro price (\$97/month)..."
PRO_PRICE=$(stripe_post "prices" \
  -d "product=$PRO_PRODUCT_ID" \
  -d "unit_amount=9700" \
  -d "currency=usd" \
  -d "recurring[interval]=month" \
  -d "metadata[plan]=pro")

PRO_PRICE_ID=$(echo "$PRO_PRICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Price:   $PRO_PRICE_ID"
echo ""

# --- Business Plan ---
echo "Creating Business product..."
BIZ_PRODUCT=$(stripe_post "products" \
  -d "name=Complens.ai Business" \
  -d "description=For agencies & scaling teams — unlimited everything" \
  -d "metadata[plan]=business")

BIZ_PRODUCT_ID=$(echo "$BIZ_PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Product: $BIZ_PRODUCT_ID"

echo "Creating Business price (\$297/month)..."
BIZ_PRICE=$(stripe_post "prices" \
  -d "product=$BIZ_PRODUCT_ID" \
  -d "unit_amount=29700" \
  -d "currency=usd" \
  -d "recurring[interval]=month" \
  -d "metadata[plan]=business")

BIZ_PRICE_ID=$(echo "$BIZ_PRICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Price:   $BIZ_PRICE_ID"
echo ""

# --- Set up EventBridge ---
echo "Creating Stripe EventBridge destination..."
EB_RESULT=$(stripe_post "webhook_endpoints" \
  -d "url=arn:aws:events:us-east-1:716521514377" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=customer.subscription.created" \
  -d "enabled_events[]=customer.subscription.updated" \
  -d "enabled_events[]=customer.subscription.deleted" \
  -d "enabled_events[]=invoice.payment_failed" \
  -d "api_version=2024-12-18.acacia" 2>&1 || true)

echo ""
echo "=== Results ==="
echo ""
echo "Pro Price ID:      $PRO_PRICE_ID"
echo "Business Price ID: $BIZ_PRICE_ID"
echo ""
echo "Add to samconfig.toml [dev.deploy.parameters] parameter_overrides:"
echo ""
echo "  StripeBillingSecretKey=$STRIPE_KEY StripeProPriceId=$PRO_PRICE_ID StripeBusinessPriceId=$BIZ_PRICE_ID"
echo ""
echo "NOTE: EventBridge must be set up manually in Stripe Dashboard:"
echo "  1. Go to: https://dashboard.stripe.com/test/webhooks/create?endpoint_type=amazon_eventbridge"
echo "  2. Select AWS account 716521514377 in us-east-1"
echo "  3. Copy the event source name and add to parameter_overrides:"
echo "     StripeEventSourceName=<the_event_source_name>"
