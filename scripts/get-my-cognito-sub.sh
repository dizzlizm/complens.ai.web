#!/bin/bash
# Helper script to extract your Cognito sub from a JWT token

echo "============================================"
echo "Extract Cognito User ID (sub) from JWT Token"
echo "============================================"
echo ""
echo "How to get your JWT token:"
echo "1. Log in to your app at https://dev.complens.ai"
echo "2. Open browser DevTools (F12)"
echo "3. Go to Application/Storage > Local Storage"
echo "4. Look for the JWT token (usually stored as 'idToken' or 'accessToken')"
echo ""
echo "Paste your JWT token below (press Enter when done):"
read -r JWT_TOKEN

if [ -z "$JWT_TOKEN" ]; then
    echo "Error: No token provided"
    exit 1
fi

# Extract the payload (second part of JWT)
PAYLOAD=$(echo "$JWT_TOKEN" | cut -d'.' -f2)

# Add padding if needed (JWT base64 might not have padding)
MOD=$((${#PAYLOAD} % 4))
if [ $MOD -eq 2 ]; then
    PAYLOAD="${PAYLOAD}=="
elif [ $MOD -eq 3 ]; then
    PAYLOAD="${PAYLOAD}="
fi

# Decode base64 and pretty print JSON
echo ""
echo "============================================"
echo "Decoded Token Information:"
echo "============================================"
echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "$PAYLOAD" | base64 -d

echo ""
echo "============================================"
echo "Extract just the 'sub' (User ID):"
echo "============================================"
COGNITO_SUB=$(echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin).get('sub', 'NOT_FOUND'))" 2>/dev/null)

if [ -n "$COGNITO_SUB" ] && [ "$COGNITO_SUB" != "NOT_FOUND" ]; then
    echo "Your Cognito User ID (sub): $COGNITO_SUB"
    echo ""
    echo "Email: $(echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin).get('email', 'NOT_FOUND'))" 2>/dev/null)"
    echo "Name: $(echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -c "import sys, json; print(json.load(sys.stdin).get('name', 'NOT_FOUND'))" 2>/dev/null)"
    echo ""
    echo "============================================"
    echo "Next Steps:"
    echo "============================================"
    echo "1. Connect to bastion: aws ssm start-session --target \$BASTION_ID --region us-east-1"
    echo "2. On bastion, run: sudo /usr/local/bin/connect-rds.sh"
    echo "3. In PostgreSQL, check if you exist:"
    echo "   SELECT * FROM user_organizations WHERE user_id = '$COGNITO_SUB';"
    echo ""
    echo "4. If no results, create your organization and owner mapping:"
    echo "   See scripts/setup-admin-user.sql for the SQL commands"
else
    echo "Could not extract Cognito sub. Please check your JWT token."
fi
