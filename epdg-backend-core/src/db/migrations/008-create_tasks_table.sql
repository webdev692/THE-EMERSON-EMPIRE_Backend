DO $$
BEGIN
    CREATE TYPE task_priority AS ENUM (
        'low',
        'normal',
        'urgent'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE task_status AS ENUM (
        'pending',
        'in_progress',
        'review',
        'done'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
    assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    priority task_priority DEFAULT 'normal',
    status task_status DEFAULT 'pending',
    due_date TIMESTAMP NOT NULL,
    points INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_placement_id ON tasks(placement_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
