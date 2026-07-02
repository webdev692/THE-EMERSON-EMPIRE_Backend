-- Step 2 of multi-tenant schema isolation: introduce a `core` schema for
-- identity/roles that will eventually be shared across epdg, agency, and
-- future branches, and backfill it from the existing epdg.users data.
--
-- Non-destructive: epdg.users is NOT dropped or altered. Every epdg.*
-- table's `user_id` FK stays pointed at epdg.users(id) exactly as it is
-- today — repointing those FKs at core.users is deliberately deferred to
-- a later task. core.users is a new, additive source of truth that sits
-- alongside epdg.users for now.
--
-- core.users.id intentionally PRESERVES the exact epdg.users.id values for
-- migrated rows (explicit id in INSERT, bypassing the column's own SERIAL
-- default) so that a future migration which repoints epdg.* FKs at
-- core.users can do so without remapping any existing row. The column is
-- still SERIAL (not a plain INTEGER) so it owns a sequence: after the
-- backfill, that sequence is advanced past the max copied id so future
-- core.users inserts (new signups, once AuthService writes here) get
-- correct fresh ids with no collision.
--
-- Idempotent / replay-safe, same pattern as 032: every CREATE is
-- IF NOT EXISTS, every backfill INSERT is guarded with WHERE NOT EXISTS
-- so a full replay (triggered by the postgres-migrations hash-mismatch
-- self-heal in src/db/index.ts) against an already-migrated database is
-- a safe no-op.

CREATE SCHEMA IF NOT EXISTS core;

-- Enum types, created fresh in `core` (not reused from epdg) so the core
-- identity layer has no dependency on the epdg schema.
DO $$
BEGIN
    CREATE TYPE core.user_role AS ENUM (
        'admin',
        'company',
        'intern',
        'school'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE core.admin_role AS ENUM ('admin', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS core.branches (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(30) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO core.branches (code, name)
SELECT 'epdg', 'Emerson Professional Development Group'
WHERE NOT EXISTS (SELECT 1 FROM core.branches WHERE code = 'epdg');

CREATE TABLE IF NOT EXISTS core.users (
    id                   SERIAL PRIMARY KEY,
    email                VARCHAR(150) NOT NULL,
    name                 VARCHAR(100) NOT NULL,
    password             VARCHAR(255) NOT NULL,
    is_verified          BOOLEAN DEFAULT FALSE,
    verification_token   VARCHAR(255),
    token_expires_at     TIMESTAMP,
    last_login_at        TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at           TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS core_users_email_unique_active
  ON core.users(email)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS core.user_branch_roles (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES core.users(id),
    branch_id        INTEGER NOT NULL REFERENCES core.branches(id),
    role_name        core.user_role NOT NULL,
    admin_role       core.admin_role,
    rejection_reason TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_roles_user_id   ON core.user_branch_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_roles_branch_id ON core.user_branch_roles(branch_id);

-- Backfill core.users with exact ids copied from epdg.users
INSERT INTO core.users (
    id, email, name, password, is_verified,
    verification_token, token_expires_at, last_login_at, created_at, deleted_at
)
SELECT
    u.id, u.email, u.name, u.password, u.is_verified,
    u.verification_token, u.token_expires_at, u.last_login_at, u.created_at, u.deleted_at
FROM epdg.users u
WHERE NOT EXISTS (
    SELECT 1 FROM core.users cu WHERE cu.id = u.id
);

-- Advance the id sequence past the highest copied id so future inserts
-- (new signups) don't collide with migrated rows.
SELECT setval(
    pg_get_serial_sequence('core.users', 'id'),
    COALESCE((SELECT MAX(id) FROM core.users), 1),
    true
);

-- Backfill core.user_branch_roles: one row per existing epdg.users row,
-- pointing at the epdg branch, with role/admin_role/rejection_reason
-- carried over. admin_role is only populated for role = 'admin', taken
-- from epdg.admins (falling back to 'admin' if role = 'admin' but no
-- epdg.admins row exists, which should not normally happen).
INSERT INTO core.user_branch_roles (
    user_id, branch_id, role_name, admin_role, rejection_reason, created_at
)
SELECT
    u.id,
    b.id,
    u.role::text::core.user_role,
    CASE
        WHEN u.role = 'admin'
            THEN COALESCE(a.admin_role::text::core.admin_role, 'admin'::core.admin_role)
        ELSE NULL
    END,
    u.rejection_reason,
    u.created_at
FROM epdg.users u
CROSS JOIN (SELECT id FROM core.branches WHERE code = 'epdg') b
LEFT JOIN epdg.admins a ON a.user_id = u.id
WHERE NOT EXISTS (
    SELECT 1
    FROM core.user_branch_roles ubr
    WHERE ubr.user_id = u.id
      AND ubr.branch_id = b.id
);
