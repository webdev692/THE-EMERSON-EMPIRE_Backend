DO $$
BEGIN
    CREATE TYPE application_status AS ENUM (
        'pending',
        'shortlisted',
        'accepted',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    intern_id INTEGER NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL REFERENCES internship_slots(id) ON DELETE CASCADE,
    cover_letter TEXT,
    status application_status DEFAULT 'pending',
    company_notes TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (intern_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_intern_id ON applications(intern_id);
CREATE INDEX IF NOT EXISTS idx_applications_slot_id ON applications(slot_id);
CREATE INDEX IF NOT EXISTS idx_applications_reviewed_by ON applications(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
