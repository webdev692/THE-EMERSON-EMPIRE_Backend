DO $$
BEGIN
    CREATE TYPE submission_status AS ENUM (
        'submitted',
        'under_review',
        'approved',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    intern_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_url VARCHAR(500) NOT NULL,
    file_name VARCHAR(255),
    file_size_kb INTEGER,
    notes TEXT,
    status submission_status DEFAULT 'submitted',
    reviewer_comment TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_task_id ON submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_placement_id ON submissions(placement_id);
CREATE INDEX IF NOT EXISTS idx_submissions_intern_id ON submissions(intern_id);
CREATE INDEX IF NOT EXISTS idx_submissions_reviewed_by ON submissions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
