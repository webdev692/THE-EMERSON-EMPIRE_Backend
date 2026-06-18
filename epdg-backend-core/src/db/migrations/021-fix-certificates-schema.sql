-- Patch: add columns that were missing when the certificates table was first created
-- Uses ADD COLUMN IF NOT EXISTS so this is safe to run multiple times

ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS intern_id            INTEGER      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS intern_name_snapshot VARCHAR(200),
  ADD COLUMN IF NOT EXISTS department_snapshot  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS program_name         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS issue_date           DATE         DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS issued_by            INTEGER      REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS template_id          INTEGER      REFERENCES certificate_templates(id),
  ADD COLUMN IF NOT EXISTS pdf_url              TEXT,
  ADD COLUMN IF NOT EXISTS integrity_hash       VARCHAR(64),
  ADD COLUMN IF NOT EXISTS status               VARCHAR(20)  DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP;
