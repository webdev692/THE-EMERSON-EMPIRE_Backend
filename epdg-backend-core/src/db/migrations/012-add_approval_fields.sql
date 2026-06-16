-- Add intern approval + rejection reason fields
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING)

-- 1. Approval flag for interns (companies/schools already have is_approved)
ALTER TABLE intern_profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Rejection reason on users (shared across all roles)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. Index for fast pending-intern queries
CREATE INDEX IF NOT EXISTS idx_intern_profiles_approved ON intern_profiles(is_approved);
