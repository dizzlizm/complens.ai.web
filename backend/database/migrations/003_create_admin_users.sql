-- Migration 003: Create Admin Users Table
-- This migration adds support for locally managed admin users with role-based access control

-- Admin Users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'user_admin', 'service_account', 'regular_user')),
  is_active BOOLEAN DEFAULT TRUE,
  password_hash TEXT,  -- For future password-based auth
  api_key_hash TEXT,   -- For service accounts
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES admin_users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES admin_users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_admin_users_org_id ON admin_users(org_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON admin_users(is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_users_updated_at();

-- Create initial super admin for demo organization
INSERT INTO admin_users (org_id, email, name, role, is_active)
SELECT
  id,
  'admin@demo.complens.ai',
  'Demo Admin',
  'super_admin',
  TRUE
FROM organizations
WHERE domain = 'demo.complens.ai'
ON CONFLICT (org_id, email) DO NOTHING;

-- Migration metadata
INSERT INTO schema_migrations (version, name)
VALUES (3, 'create_admin_users')
ON CONFLICT (version) DO NOTHING;
