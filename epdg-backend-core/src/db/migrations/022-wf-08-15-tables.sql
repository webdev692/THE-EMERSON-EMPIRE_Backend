-- WF-08: Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id               SERIAL PRIMARY KEY,
  subject          VARCHAR(200) NOT NULL,
  message          TEXT NOT NULL,
  target_audience  VARCHAR(20) NOT NULL DEFAULT 'all',
  created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WF-10: Points / Gamification
CREATE TABLE IF NOT EXISTS point_events (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(200) NOT NULL,
  points      INTEGER NOT NULL,
  awarded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS badges (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  emoji        VARCHAR(10)  NOT NULL,
  description  TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS badge_awards (
  id          SERIAL PRIMARY KEY,
  badge_id    INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  awarded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO badges (name, emoji, description) VALUES
  ('Star Performer',  '⭐', 'Top performer this month'),
  ('Team Player',     '🤝', 'Consistently supports peers'),
  ('Fast Learner',    '🚀', 'Mastered a new skill quickly'),
  ('Streak Master',   '🔥', 'Maintained a 30-day streak'),
  ('Portfolio Pro',   '💼', 'Submitted outstanding portfolio work'),
  ('Mentor Approved', '🏅', 'Highly rated by assigned mentor')
ON CONFLICT (name) DO NOTHING;

-- WF-13: Resources
CREATE TABLE IF NOT EXISTS resources (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(200) NOT NULL,
  type       VARCHAR(20)  NOT NULL DEFAULT 'guide',
  url        TEXT,
  owner      VARCHAR(100),
  status     VARCHAR(20)  NOT NULL DEFAULT 'published',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WF-14: Feedback
CREATE TABLE IF NOT EXISTS feedback (
  id         SERIAL PRIMARY KEY,
  from_name  VARCHAR(200) NOT NULL,
  role       VARCHAR(50)  NOT NULL DEFAULT 'intern',
  category   VARCHAR(100) NOT NULL DEFAULT 'General',
  comment    TEXT         NOT NULL,
  rating     SMALLINT     NOT NULL DEFAULT 5,
  status     VARCHAR(20)  NOT NULL DEFAULT 'new',
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WF-15: Platform settings (key-value)
CREATE TABLE IF NOT EXISTS platform_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_settings (key, value) VALUES
  ('notifications_enabled',  'true'),
  ('audit_logs_enabled',     'true'),
  ('open_registration',      'true'),
  ('data_retention_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
