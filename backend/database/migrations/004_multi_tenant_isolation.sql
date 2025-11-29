-- Migration 004: Multi-Tenant Data Isolation
-- This migration implements comprehensive multi-tenant data isolation with:
-- 1. User-Organization mapping to support multiple auth providers
-- 2. SAML/SSO provider configuration
-- 3. Enhanced organization settings for scalability
-- 4. Critical: Add org_id to conversations for proper isolation
-- 5. Audit logging for compliance

-- ============================================================================
-- USER-ORGANIZATION MAPPING
-- ============================================================================
-- This table maps authenticated users to organizations, supporting:
-- - Cognito users (via sub claim)
-- - SAML/SSO users (via SAML user ID)
-- - Local database users (via admin_users.id)
CREATE TABLE IF NOT EXISTS user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,  -- Cognito sub, SAML user ID, or admin_users.id
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('cognito', 'saml', 'local')),
  is_primary BOOLEAN DEFAULT false,  -- Primary org for multi-org users
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR,
  UNIQUE(user_id, org_id)
);

-- Indexes for fast user → org lookups
CREATE INDEX IF NOT EXISTS idx_user_orgs_user_id ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org_id ON user_organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_auth_provider ON user_organizations(auth_provider);
CREATE INDEX IF NOT EXISTS idx_user_orgs_role ON user_organizations(role);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_user_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_organizations_updated_at
  BEFORE UPDATE ON user_organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_organizations_updated_at();

-- ============================================================================
-- SAML/SSO PROVIDER CONFIGURATION
-- ============================================================================
-- Stores SAML identity provider configuration per organization
CREATE TABLE IF NOT EXISTS saml_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  idp_entity_id TEXT NOT NULL,
  idp_sso_url TEXT NOT NULL,
  idp_certificate TEXT NOT NULL,  -- X.509 certificate for signature validation
  sp_entity_id TEXT,  -- Service Provider entity ID (our app)
  sp_acs_url TEXT,  -- Assertion Consumer Service URL
  enabled BOOLEAN DEFAULT true,
  attribute_mapping JSONB DEFAULT '{
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  }'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id)
);

CREATE INDEX IF NOT EXISTS idx_saml_providers_org_id ON saml_providers(org_id);
CREATE INDEX IF NOT EXISTS idx_saml_providers_enabled ON saml_providers(enabled);

-- ============================================================================
-- ENHANCE ORGANIZATIONS TABLE
-- ============================================================================
-- Add tenant tier, limits, and scalability settings
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS rate_limit_per_hour INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{
  "sso_enabled": false,
  "audit_logs": false,
  "api_access": false,
  "custom_integrations": false
}'::jsonb,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'churned'));

-- Index for filtering by tier and status
CREATE INDEX IF NOT EXISTS idx_organizations_tier ON organizations(tier);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- ============================================================================
-- ADD TENANT ISOLATION TO CONVERSATIONS
-- ============================================================================
-- CRITICAL: Conversations currently lack org_id, making them isolated only by user_id
-- This adds organization-level isolation for proper multi-tenancy

-- Add org_id column to conversations
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_user ON conversations(org_id, user_id);

-- ============================================================================
-- AUDIT LOGS FOR COMPLIANCE
-- ============================================================================
-- Comprehensive audit trail for all tenant data access and modifications
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id VARCHAR,  -- Cognito sub or SAML user ID
  action TEXT NOT NULL,  -- e.g., 'conversation.create', 'user.invite', 'settings.update'
  resource_type TEXT,  -- e.g., 'conversation', 'user', 'organization'
  resource_id TEXT,  -- UUID or identifier of the resource
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR,  -- For correlating with CloudWatch logs
  status TEXT CHECK (status IN ('success', 'failure', 'unauthorized')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- ============================================================================
-- TENANT INVITATION SYSTEM
-- ============================================================================
-- Track pending user invitations to organizations
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by VARCHAR NOT NULL,  -- user_id of inviter
  token VARCHAR UNIQUE NOT NULL,  -- Secure invitation token
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_org_id ON user_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);

-- ============================================================================
-- TENANT USAGE TRACKING
-- ============================================================================
-- Track API usage per tenant for rate limiting and billing
CREATE TABLE IF NOT EXISTS tenant_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  api_calls INTEGER DEFAULT 0,
  ai_tokens_used BIGINT DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  active_users INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_org_id ON tenant_usage(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage(period_start DESC);

-- ============================================================================
-- DATA MIGRATION: Link existing data to organizations
-- ============================================================================
-- For existing deployments, we need to:
-- 1. Assign existing conversations to a default organization
-- 2. Map existing Cognito users to organizations

-- Get the demo organization ID (or create if doesn't exist)
DO $$
DECLARE
  demo_org_id UUID;
BEGIN
  -- Get or create demo organization
  SELECT id INTO demo_org_id FROM organizations WHERE domain = 'demo.complens.ai';

  IF demo_org_id IS NULL THEN
    INSERT INTO organizations (name, domain, settings, tier, max_users)
    VALUES ('Demo Organization', 'demo.complens.ai', '{}'::jsonb, 'free', 50)
    RETURNING id INTO demo_org_id;
  END IF;

  -- Update existing conversations to belong to demo org (if org_id is NULL)
  UPDATE conversations
  SET org_id = demo_org_id
  WHERE org_id IS NULL;

  -- Create user_organizations entries for any existing Cognito users in conversations
  -- This assumes user_id in conversations is the Cognito sub
  INSERT INTO user_organizations (user_id, org_id, role, auth_provider, is_primary)
  SELECT DISTINCT
    user_id,
    demo_org_id,
    'member',
    'cognito',
    true
  FROM conversations
  WHERE user_id IS NOT NULL
  ON CONFLICT (user_id, org_id) DO NOTHING;

END $$;

-- ============================================================================
-- SECURITY: Row-Level Security Policies (Optional but Recommended)
-- ============================================================================
-- These policies provide database-level enforcement of tenant isolation
-- They work by setting app.current_org_id in session and filtering automatically

-- Enable RLS on key tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access data from their organization
CREATE POLICY tenant_isolation_conversations ON conversations
  USING (org_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID);

CREATE POLICY tenant_isolation_findings ON findings
  USING (org_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (org_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID);

-- Note: To use RLS, each database query must first execute:
-- SET LOCAL app.current_org_id = '<org_id>';

-- ============================================================================
-- MIGRATION METADATA
-- ============================================================================
INSERT INTO schema_migrations (version, name)
VALUES (4, 'multi_tenant_isolation')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE user_organizations IS 'Maps authenticated users to organizations, supporting multiple auth providers (Cognito, SAML, local)';
COMMENT ON TABLE saml_providers IS 'SAML/SSO identity provider configuration per organization';
COMMENT ON TABLE user_invitations IS 'Pending user invitations to organizations';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for compliance and security';
COMMENT ON TABLE tenant_usage IS 'API usage tracking per tenant for rate limiting and billing';

COMMENT ON COLUMN conversations.org_id IS 'Organization ID for multi-tenant isolation - REQUIRED for all new conversations';
COMMENT ON COLUMN organizations.tier IS 'Subscription tier: free, pro, or enterprise';
COMMENT ON COLUMN organizations.features IS 'Feature flags per organization based on tier';
