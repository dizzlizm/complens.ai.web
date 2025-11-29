-- Quick fix: Add missing columns to organizations table
-- Run this if you get "column does not exist" errors

-- Check current organizations table structure
\d organizations

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add max_users column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_users'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_users INTEGER DEFAULT 10;
        RAISE NOTICE '✅ Added max_users column';
    ELSE
        RAISE NOTICE '⏭️  max_users column already exists';
    END IF;

    -- Add max_conversations_per_month column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'max_conversations_per_month'
    ) THEN
        ALTER TABLE organizations ADD COLUMN max_conversations_per_month INTEGER DEFAULT 1000;
        RAISE NOTICE '✅ Added max_conversations_per_month column';
    ELSE
        RAISE NOTICE '⏭️  max_conversations_per_month column already exists';
    END IF;

    -- Add features column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'features'
    ) THEN
        ALTER TABLE organizations ADD COLUMN features JSONB DEFAULT '{}'::jsonb;
        RAISE NOTICE '✅ Added features column';
    ELSE
        RAISE NOTICE '⏭️  features column already exists';
    END IF;

    -- Add tier column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'tier'
    ) THEN
        ALTER TABLE organizations ADD COLUMN tier TEXT DEFAULT 'free';
        RAISE NOTICE '✅ Added tier column';
    ELSE
        RAISE NOTICE '⏭️  tier column already exists';
    END IF;
END $$;

-- Verify the columns were added
\d organizations

-- Show current organizations
SELECT id, name, tier, max_users, max_conversations_per_month FROM organizations;
