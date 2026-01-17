-- Migration 005: Add unique constraint to findings table for upsert operations
-- This allows the security scanner to update existing findings instead of creating duplicates

-- Add unique constraint on (org_id, type, resource) to support ON CONFLICT upsert
-- This allows us to update existing findings when they're rediscovered
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'findings_org_type_resource_unique'
  ) THEN
    ALTER TABLE findings
    ADD CONSTRAINT findings_org_type_resource_unique
    UNIQUE (org_id, type, resource);
  END IF;
END $$;

-- Add index on resource for faster lookups
CREATE INDEX IF NOT EXISTS idx_findings_resource ON findings(resource);

-- Add last_seen_at column to track when findings were last detected
ALTER TABLE findings
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Add source column to track where finding originated (manual, scheduled_scan, api)
ALTER TABLE findings
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Migration metadata
INSERT INTO schema_migrations (version, name)
VALUES (5, 'add_findings_unique_constraint')
ON CONFLICT (version) DO NOTHING;
