-- Migration 002: Create Security Analysis Tables
-- This migration adds tables for security findings, organizations, and Google Workspace data

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Security Findings table
CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resource TEXT NOT NULL,
  description TEXT NOT NULL,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by TEXT,
  notes TEXT
);

-- Indexes for findings
CREATE INDEX IF NOT EXISTS idx_findings_org_id ON findings(org_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_discovered_at ON findings(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_type ON findings(type);
CREATE INDEX IF NOT EXISTS idx_findings_resolved ON findings(resolved);

-- Google Workspace Users table
CREATE TABLE IF NOT EXISTS gws_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  has_2fa BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMP,
  suspended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_gws_users_org_id ON gws_users(org_id);
CREATE INDEX IF NOT EXISTS idx_gws_users_email ON gws_users(email);
CREATE INDEX IF NOT EXISTS idx_gws_users_is_admin ON gws_users(is_admin);
CREATE INDEX IF NOT EXISTS idx_gws_users_has_2fa ON gws_users(has_2fa);

-- Google Workspace Groups table
CREATE TABLE IF NOT EXISTS gws_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  members_count INTEGER DEFAULT 0,
  external_members_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_gws_groups_org_id ON gws_groups(org_id);

-- Google Workspace Files table (Drive)
CREATE TABLE IF NOT EXISTS gws_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  owner_email TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  is_external_shared BOOLEAN DEFAULT FALSE,
  sharing_settings JSONB DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_gws_files_org_id ON gws_files(org_id);
CREATE INDEX IF NOT EXISTS idx_gws_files_is_public ON gws_files(is_public);
CREATE INDEX IF NOT EXISTS idx_gws_files_is_external_shared ON gws_files(is_external_shared);
CREATE INDEX IF NOT EXISTS idx_gws_files_owner ON gws_files(owner_email);

-- Chrome Web Store Extensions table
CREATE TABLE IF NOT EXISTS cws_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  publisher TEXT,
  verified_publisher BOOLEAN DEFAULT FALSE,
  permissions JSONB DEFAULT '[]'::jsonb,
  risk_score INTEGER DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  last_updated TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cws_extensions_risk_score ON cws_extensions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_cws_extensions_publisher ON cws_extensions(publisher);

-- Chrome Web Store Installations table
CREATE TABLE IF NOT EXISTS cws_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL REFERENCES cws_extensions(extension_id) ON DELETE CASCADE,
  installed_by TEXT,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id, extension_id, installed_by)
);

CREATE INDEX IF NOT EXISTS idx_cws_installations_org_id ON cws_installations(org_id);
CREATE INDEX IF NOT EXISTS idx_cws_installations_extension_id ON cws_installations(extension_id);

-- Security Rules table (for custom security policies)
CREATE TABLE IF NOT EXISTS security_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled BOOLEAN DEFAULT TRUE,
  query TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_rules_org_id ON security_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_security_rules_enabled ON security_rules(enabled);

-- Audit Events table (for tracking changes)
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);

-- Create default demo organization for testing
INSERT INTO organizations (name, domain, settings)
VALUES (
  'Demo Organization',
  'demo.complens.ai',
  '{"tier": "free", "max_users": 50}'::jsonb
)
ON CONFLICT (domain) DO NOTHING;

-- Migration metadata
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, name)
VALUES (2, 'create_security_tables')
ON CONFLICT (version) DO NOTHING;
