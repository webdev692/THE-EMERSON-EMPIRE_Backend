-- Add admin_type to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS admin_type VARCHAR(30) NOT NULL DEFAULT 'general';

-- Backfill: existing mentors get admin_type = 'mentor'
UPDATE admins SET admin_type = 'mentor' WHERE is_mentor = TRUE AND admin_type = 'general';

-- Index for fast lookups by type
CREATE INDEX IF NOT EXISTS idx_admins_admin_type ON admins(admin_type);

-- Also add max_capacity default if missing
ALTER TABLE admins ALTER COLUMN max_capacity SET DEFAULT 3;

-- Make school_id nullable in placements — not every intern comes through a school
ALTER TABLE placements ALTER COLUMN school_id DROP NOT NULL;
