DO $$
BEGIN
    CREATE TYPE placement_status AS ENUM (
        'active',
        'completed',
        'terminated',
        'on_hold'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS placements (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    intern_id INTEGER NOT NULL REFERENCES intern_profiles(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL REFERENCES internship_slots(id) ON DELETE CASCADE,
    mentor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status placement_status DEFAULT 'active',
    termination_reason TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_placements_intern_id ON placements(intern_id);
CREATE INDEX IF NOT EXISTS idx_placements_company_id ON placements(company_id);
CREATE INDEX IF NOT EXISTS idx_placements_school_id ON placements(school_id);
CREATE INDEX IF NOT EXISTS idx_placements_slot_id ON placements(slot_id);
CREATE INDEX IF NOT EXISTS idx_placements_mentor_id ON placements(mentor_id);
CREATE INDEX IF NOT EXISTS idx_placements_status ON placements(status);
