#!/bin/bash
# Script to apply multi-tenant database migration
# Run this from your local machine

# Configuration - UPDATE THESE VALUES
RDS_ENDPOINT="your-rds-endpoint.rds.amazonaws.com"
DB_NAME="complens"
DB_USER="postgres"
# Password will be prompted

echo "================================================"
echo "Multi-Tenant Database Migration"
echo "================================================"
echo ""
echo "This will create the following tables:"
echo "  - user_organizations (user → org mapping)"
echo "  - saml_providers (SSO configuration)"
echo "  - user_invitations (invitation workflow)"
echo "  - audit_logs (compliance logging)"
echo "  - tenant_usage (API usage tracking)"
echo ""
echo "And update:"
echo "  - organizations (add tier, limits, features)"
echo "  - conversations (add org_id)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 1
fi

echo ""
echo "Connecting to RDS..."
echo "Host: $RDS_ENDPOINT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Run the migration
psql -h "$RDS_ENDPOINT" -U "$DB_USER" -d "$DB_NAME" -f backend/database/migrations/004_multi_tenant_isolation.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================"
    echo "✅ Migration completed successfully!"
    echo "================================================"
    echo ""
    echo "Next steps:"
    echo "1. Deploy your backend (sam deploy)"
    echo "2. Clear browser cache and log in"
    echo "3. Your org will auto-provision on first request"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Check the errors above."
    exit 1
fi
