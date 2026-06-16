ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS extracted_skills JSONB,
  ADD COLUMN IF NOT EXISTS cv_text_snapshot TEXT;
