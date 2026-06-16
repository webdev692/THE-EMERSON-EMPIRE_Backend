-- Intern profile enrichment
-- Safe to run multiple times (ALTER TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

ALTER TABLE intern_profiles
  ADD COLUMN IF NOT EXISTS contact_phone  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS department     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mentor_name    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS track          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS profile_photo  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS linkedin_url   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS github_url     VARCHAR(500),
  ADD COLUMN IF NOT EXISTS portfolio_url  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS country        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city           VARCHAR(100);

-- Announcements table (admin posts → interns see)
CREATE TABLE IF NOT EXISTS announcements (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  audience    VARCHAR(20)  NOT NULL DEFAULT 'all'
                CHECK (audience IN ('all','intern','company','school','admin')),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_audience ON announcements(audience);

-- Seed 2 starter announcements for testing
INSERT INTO announcements (title, body, audience, created_at)
VALUES
  ('Welcome to Emerson Professional',
   'Congratulations on joining the EPDG program. Complete your onboarding to unlock all features.',
   'intern', NOW()),
  ('Portfolio submissions now open',
   'You can now submit your first portfolio task under the Portfolio section. Track and document your work.',
   'intern', NOW())
ON CONFLICT DO NOTHING;
