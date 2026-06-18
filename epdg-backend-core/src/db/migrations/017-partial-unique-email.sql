-- Replace the full-table unique constraint on email with a partial index
-- so that soft-deleted users don't block re-registration with the same email.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_active
  ON users(email)
  WHERE deleted_at IS NULL;
