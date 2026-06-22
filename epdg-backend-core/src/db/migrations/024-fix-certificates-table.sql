-- Fix certificates table:
--   (a) If id column is integer, the table was created before migration 020
--       and no valid certs can exist — drop and recreate with UUID id.
--   (b) If id is already UUID but certificate_number is missing, add it.
--
-- Safe to run multiple times.

DO $$
DECLARE
  id_type text;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'certificates'
    AND column_name  = 'id';

  -- Integer id means the table predates migration 020.
  -- All insert attempts would have failed with a uuid cast error,
  -- so no real certificate data exists — safe to drop and recreate.
  IF id_type = 'integer' THEN
    DROP TABLE IF EXISTS certificates CASCADE;
  END IF;
END;
$$;

-- Recreate (or leave untouched if already correct UUID table)
CREATE TABLE IF NOT EXISTS certificates (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number    VARCHAR(50) UNIQUE NOT NULL,
    intern_id             INTEGER     NOT NULL REFERENCES users(id),
    intern_name_snapshot  VARCHAR(200) NOT NULL,
    department_snapshot   VARCHAR(100),
    program_name          VARCHAR(200) NOT NULL,
    issue_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
    issued_by             INTEGER     NOT NULL REFERENCES users(id),
    template_id           INTEGER     REFERENCES certificate_templates(id),
    pdf_url               TEXT,
    integrity_hash        VARCHAR(64) NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'revoked')),
    created_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Safety: if the table already existed with UUID id but was missing certificate_number
-- (the scenario migration 021 left us in), add it now.
ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS certificate_number VARCHAR(50);

-- Back-fill any rows that ended up with NULL certificate_number
UPDATE certificates
SET certificate_number = 'EPDG-LEGACY-' || SUBSTRING(id::text, 1, 8)
WHERE certificate_number IS NULL;

-- Enforce NOT NULL (idempotent if already set)
ALTER TABLE certificates
  ALTER COLUMN certificate_number SET NOT NULL;

-- Add UNIQUE constraint only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename  = 'certificates'
      AND indexname  = 'certificates_certificate_number_key'
  ) THEN
    ALTER TABLE certificates
      ADD CONSTRAINT certificates_certificate_number_key UNIQUE (certificate_number);
  END IF;
END;
$$;
