-- Onboarding status tracking on intern_profiles
ALTER TABLE intern_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'pending_approval';

-- Additional onboarding columns
ALTER TABLE intern_profiles
  ADD COLUMN IF NOT EXISTS mentor_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS track_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_problem  TEXT;

-- Backfill: already-approved interns who haven't fully onboarded → pending_onboarding
UPDATE intern_profiles
  SET onboarding_status = 'pending_onboarding'
  WHERE is_approved = true
    AND onboarding_status = 'pending_approval'
    AND onboarding_complete = false;

-- Backfill: already fully-onboarded interns → active
UPDATE intern_profiles
  SET onboarding_status = 'active'
  WHERE onboarding_complete = true
    AND onboarding_status = 'pending_approval';

-- Signed-agreement audit trail
CREATE TABLE IF NOT EXISTS onboarding_agreements (
  id             SERIAL PRIMARY KEY,
  intern_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agreement_type VARCHAR(30) NOT NULL CHECK (agreement_type IN ('nda', 'disclaimer')),
  agreed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address     VARCHAR(45),
  user_agent     TEXT,
  agreement_text TEXT NOT NULL,
  UNIQUE (intern_id, agreement_type)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_agreements_intern ON onboarding_agreements(intern_id);
