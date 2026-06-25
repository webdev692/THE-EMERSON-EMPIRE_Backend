-- Add level-up request tracking to intern_level_progress
ALTER TABLE intern_level_progress
  ADD COLUMN IF NOT EXISTS level_up_requested_at TIMESTAMPTZ;
