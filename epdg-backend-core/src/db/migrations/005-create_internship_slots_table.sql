DO $$
BEGIN
    CREATE TYPE internship_slot_status AS ENUM (
        'draft',
        'open',
        'closed',
        'filled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS internship_slots (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    department VARCHAR(100),
    description TEXT,
    requirements TEXT,
    skills_required JSONB,
    slots_available INTEGER DEFAULT 1,
    slots_filled INTEGER DEFAULT 0,
    duration_weeks INTEGER,
    stipend NUMERIC(10, 2),
    is_remote BOOLEAN DEFAULT FALSE,
    county VARCHAR(100),
    deadline DATE,
    status internship_slot_status DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_internship_slots_company_id ON internship_slots(company_id);
CREATE INDEX IF NOT EXISTS idx_internship_slots_status ON internship_slots(status);
