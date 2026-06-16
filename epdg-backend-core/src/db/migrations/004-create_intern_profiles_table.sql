CREATE TABLE IF NOT EXISTS intern_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
    course VARCHAR(150),
    year_of_study SMALLINT,
    cv_url VARCHAR(500),
    skills JSONB,
    bio TEXT,
    availability_start DATE,
    availability_end DATE,
    nda_signed BOOLEAN DEFAULT FALSE,
    disclaimer_accepted BOOLEAN DEFAULT FALSE,
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intern_profiles_user_id ON intern_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_intern_profiles_school_id ON intern_profiles(school_id);
