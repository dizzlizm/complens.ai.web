#!/bin/bash
# Test CORS preflight request

API_ENDPOINT="https://pod40r2jbf.execute-api.us-east-1.amazonaws.com/dev/chat"

echo "🧪 Testing CORS Preflight Request"
echo "=================================="
echo ""
echo "Endpoint: $API_ENDPOINT"
echo ""

# Test OPTIONS request
echo "Sending OPTIONS request..."
echo ""

curl -X OPTIONS \
  -H "Origin: https://dev.complens.ai" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v \
  "$API_ENDPOINT" 2>&1 | grep -E "(< HTTP|< access-control|< Access-Control|HTTP/)"

echo ""
echo ""
echo "Expected headers:"
echo "  access-control-allow-origin: https://dev.complens.ai"
echo "  access-control-allow-credentials: true"
echo "  access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS"
echo ""
