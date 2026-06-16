CREATE TABLE IF NOT EXISTS milestones (
    id SERIAL PRIMARY KEY,
    placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_week INTEGER NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_milestones_placement_id ON milestones(placement_id);
CREATE INDEX IF NOT EXISTS idx_milestones_completed_by ON milestones(completed_by);
