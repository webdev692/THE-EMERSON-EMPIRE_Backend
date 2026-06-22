-- Patch: add certificate_number column that was omitted from migration 021
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS certificate_number VARCHAR(50);

-- Back-fill any existing rows that have no certificate number
-- (uses the UUID id as a fallback so the column is never null)
UPDATE certificates
SET certificate_number = 'EPDG-LEGACY-' || SUBSTRING(id::text, 1, 8)
WHERE certificate_number IS NULL;

-- Now that all rows have a value, enforce the constraint
ALTER TABLE certificates
  ALTER COLUMN certificate_number SET NOT NULL;

-- Add unique index only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'certificates'
      AND indexname  = 'certificates_certificate_number_key'
  ) THEN
    ALTER TABLE certificates
      ADD CONSTRAINT certificates_certificate_number_key UNIQUE (certificate_number);
  END IF;
END;
$$;
