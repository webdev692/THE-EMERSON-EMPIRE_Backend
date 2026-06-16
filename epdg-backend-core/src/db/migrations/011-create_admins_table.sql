DROP TABLE IF EXISTS admins CASCADE;

DO $$
BEGIN
    CREATE TYPE admin_role AS ENUM ('admin', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_role admin_role NOT NULL DEFAULT 'admin',
    is_mentor BOOLEAN DEFAULT FALSE,
    department VARCHAR(100),
    permissions JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id);
