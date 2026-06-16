CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    country VARCHAR(100),
    county VARCHAR(100),
    industry VARCHAR(100),
    number_of_employees INTEGER,
    registration_number VARCHAR(100),
    website VARCHAR(255),
    logo_url VARCHAR(500),
    description TEXT,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    is_verified BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMP,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies(user_id);
CREATE INDEX IF NOT EXISTS idx_companies_approved_by ON companies(approved_by);
