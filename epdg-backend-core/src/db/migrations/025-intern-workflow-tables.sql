-- Intern workflow tables: roadmap, mentor sessions, intern skills
-- + target_user_id on feedback for mentor→intern feedback

-- 1. Roadmap weeks (programme-level, shared across all interns)
CREATE TABLE IF NOT EXISTS roadmap_weeks (
  id          SERIAL PRIMARY KEY,
  week_number SMALLINT NOT NULL UNIQUE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  skills      TEXT[] DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roadmap_weeks (week_number, title, description, skills) VALUES
  (1,  'Onboarding & Environment Setup',      'Complete workspace setup, configure tools, and review programme expectations.',                        ARRAY['Workspace Setup','Tool Configuration','Team Introduction']),
  (2,  'Foundation & Core Skills',            'Build foundational skills specific to your track and department.',                                     ARRAY['Track Fundamentals','Domain Basics','Research Methods']),
  (3,  'First Task Delivery',                 'Complete and submit your first assigned tasks with mentor guidance.',                                  ARRAY['Task Management','Submission Process','Feedback Loop']),
  (4,  'Deep Dive & Specialisation',          'Deepen track-specific skills and take on more complex assignments.',                                   ARRAY['Specialisation','Advanced Tasks','Self-Learning']),
  (5,  'Collaboration & Communication',       'Work on team-based projects and improve professional communication.',                                  ARRAY['Teamwork','Communication','Documentation']),
  (6,  'Mid-Programme Review',                'Mentor evaluation, progress checkpoint, and goal realignment.',                                        ARRAY['Performance Review','Goal Setting','Feedback Integration']),
  (7,  'Portfolio Development',               'Begin building portfolio pieces demonstrating key skills gained.',                                     ARRAY['Portfolio Building','Showcasing Work','Presentation Skills']),
  (8,  'Advanced Projects',                   'Lead or contribute to a significant project aligned with your track.',                                 ARRAY['Project Leadership','Problem Solving','Stakeholder Management']),
  (9,  'Peer Learning & Mentoring',           'Share knowledge with peers and support junior cohort members.',                                        ARRAY['Teaching Others','Knowledge Transfer','Leadership']),
  (10, 'Refinement & Quality',                'Review and improve previous work based on accumulated feedback.',                                      ARRAY['Quality Assurance','Iteration','Attention to Detail']),
  (11, 'Final Project Preparation',           'Prepare final deliverables and portfolio for programme completion.',                                   ARRAY['Final Deliverables','Portfolio Completion','Presentation Prep']),
  (12, 'Programme Completion & Showcase',     'Present your work, receive final evaluation, and earn your certificate.',                             ARRAY['Final Presentation','Certificate Issuance','Programme Graduation'])
ON CONFLICT (week_number) DO NOTHING;

-- 2. Per-intern roadmap progress
CREATE TABLE IF NOT EXISTS intern_roadmap_progress (
  id           SERIAL PRIMARY KEY,
  intern_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id      INTEGER NOT NULL REFERENCES roadmap_weeks(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'locked',
  completed_at TIMESTAMP,
  UNIQUE (intern_id, week_id)
);

CREATE INDEX IF NOT EXISTS idx_intern_roadmap_intern_id ON intern_roadmap_progress(intern_id);

-- 3. Mentor sessions
CREATE TABLE IF NOT EXISTS mentor_sessions (
  id            SERIAL PRIMARY KEY,
  placement_id  INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  mentor_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intern_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at  TIMESTAMP NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  notes         TEXT,
  intern_rating SMALLINT,
  mentor_notes  TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mentor_sessions_intern_id  ON mentor_sessions(intern_id);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_mentor_id  ON mentor_sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_placement  ON mentor_sessions(placement_id);

-- 4. Intern skills (proficiency tracking per intern)
CREATE TABLE IF NOT EXISTS intern_skills (
  id          SERIAL PRIMARY KEY,
  intern_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name  VARCHAR(100) NOT NULL,
  proficiency SMALLINT NOT NULL DEFAULT 0 CHECK (proficiency BETWEEN 0 AND 100),
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (intern_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_intern_skills_intern_id ON intern_skills(intern_id);

-- 5. Add target_user_id to feedback so mentors can send feedback to interns
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
