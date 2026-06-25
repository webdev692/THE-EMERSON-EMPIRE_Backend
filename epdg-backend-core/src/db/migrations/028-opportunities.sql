-- Gigs and jobs that interns can discover and apply to

CREATE TABLE IF NOT EXISTS opportunities (
  id              SERIAL PRIMARY KEY,
  type            VARCHAR(10)  NOT NULL DEFAULT 'gig'
                    CHECK (type IN ('gig', 'job')),
  title           VARCHAR(200) NOT NULL,
  company_id      INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  department      VARCHAR(100),
  description     TEXT,
  requirements    TEXT,
  skills_required JSONB,
  compensation    VARCHAR(100),
  duration        VARCHAR(100),
  is_remote       BOOLEAN      NOT NULL DEFAULT FALSE,
  county          VARCHAR(100),
  deadline        DATE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed', 'filled')),
  posted_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities (status);
CREATE INDEX IF NOT EXISTS idx_opportunities_type   ON opportunities (type);

-- Applications to gigs / jobs

CREATE TABLE IF NOT EXISTS opportunity_applications (
  id             SERIAL PRIMARY KEY,
  intern_id      INTEGER NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id)   ON DELETE CASCADE,
  cover_letter   TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'shortlisted', 'accepted', 'rejected')),
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (intern_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_opp_apps_intern_id  ON opportunity_applications (intern_id);
CREATE INDEX IF NOT EXISTS idx_opp_apps_opp_id     ON opportunity_applications (opportunity_id);
