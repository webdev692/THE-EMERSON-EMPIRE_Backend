-- Career File system
-- career_files: one per intern
-- career_experiences, career_projects, career_skills: sections
-- readiness_score_history: time-series for trajectory view

CREATE TABLE IF NOT EXISTS career_files (
  id                     SERIAL PRIMARY KEY,
  intern_profile_id      INTEGER NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
  slug                   VARCHAR(120) UNIQUE,
  headline               VARCHAR(255),
  summary                TEXT,
  readiness_score        INTEGER NOT NULL DEFAULT 0
                           CHECK (readiness_score BETWEEN 0 AND 100),
  readiness_tier         VARCHAR(30) NOT NULL DEFAULT 'not_ready'
                           CHECK (readiness_tier IN (
                             'not_ready','developing','internship_ready',
                             'internship_ready_plus','employer_ready')),
  mentor_approved_tier   BOOLEAN NOT NULL DEFAULT FALSE,
  is_public              BOOLEAN NOT NULL DEFAULT FALSE,
  last_auto_populated_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intern_profile_id)
);

CREATE TABLE IF NOT EXISTS career_experiences (
  id             SERIAL PRIMARY KEY,
  career_file_id INTEGER NOT NULL REFERENCES career_files(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  organization   VARCHAR(255),
  start_date     DATE,
  end_date       DATE,
  is_current     BOOLEAN NOT NULL DEFAULT FALSE,
  description    TEXT,
  source         VARCHAR(20) NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','platform')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS career_projects (
  id             SERIAL PRIMARY KEY,
  career_file_id INTEGER NOT NULL REFERENCES career_files(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  technologies   TEXT[] DEFAULT '{}',
  url            TEXT,
  source         VARCHAR(30) NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','module_completion','submission','portfolio')),
  source_ref_id  INTEGER,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  mentor_signed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: only deduplicate platform-sourced entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_projects_platform_dedup
  ON career_projects (career_file_id, source, source_ref_id)
  WHERE source_ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS career_skills (
  id             SERIAL PRIMARY KEY,
  career_file_id INTEGER NOT NULL REFERENCES career_files(id) ON DELETE CASCADE,
  skill_name     VARCHAR(100) NOT NULL,
  category       VARCHAR(50),
  source         VARCHAR(30) NOT NULL DEFAULT 'self_reported'
                   CHECK (source IN (
                     'self_reported','extracted_cv','platform_activity','mentor_endorsed')),
  proficiency    VARCHAR(20) NOT NULL DEFAULT 'beginner'
                   CHECK (proficiency IN ('beginner','intermediate','advanced')),
  endorsed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  endorsed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (career_file_id, skill_name)
);

CREATE TABLE IF NOT EXISTS readiness_score_history (
  id             SERIAL PRIMARY KEY,
  career_file_id INTEGER NOT NULL REFERENCES career_files(id) ON DELETE CASCADE,
  score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier           VARCHAR(30) NOT NULL,
  breakdown      JSONB,
  snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_files_intern_profile ON career_files(intern_profile_id);
CREATE INDEX IF NOT EXISTS idx_career_files_slug           ON career_files(slug);
CREATE INDEX IF NOT EXISTS idx_career_files_tier           ON career_files(readiness_tier);
CREATE INDEX IF NOT EXISTS idx_career_projects_file        ON career_projects(career_file_id);
CREATE INDEX IF NOT EXISTS idx_career_skills_file          ON career_skills(career_file_id);
CREATE INDEX IF NOT EXISTS idx_readiness_history_file      ON readiness_score_history(career_file_id, snapshot_at);
