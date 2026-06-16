-- Add cover_letter to intern_profiles for initial program application
ALTER TABLE intern_profiles
  ADD COLUMN IF NOT EXISTS cover_letter TEXT;
