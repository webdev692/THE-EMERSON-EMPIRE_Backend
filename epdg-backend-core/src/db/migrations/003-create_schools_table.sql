DO $$
BEGIN
    CREATE TYPE school_type AS ENUM (
        'university',
        'college',
        'polytechnic',
        'tvet'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    school_type school_type,
    county VARCHAR(100),
    address TEXT,
    website VARCHAR(255),
    logo_url VARCHAR(500),
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    courses_offered JSONB,
    is_verified BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schools_user_id ON schools(user_id);
CREATE INDEX IF NOT EXISTS idx_schools_approved_by ON schools(approved_by);
