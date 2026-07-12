/**
 * Seed Super Admin
 * Run: npx ts-node src/scripts/seed-super-admin.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import { getPool, testConnection } from '../db';

const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME;
const email = process.env.SUPER_ADMIN_EMAIL;
if (!password || !name || !email) {
  console.error('Required super-administrator seed configuration is unavailable.');
  process.exit(1);
}

const SUPER_ADMIN = {
  name,
  email,
  password,
  role:     'admin' as const,
};

async function seed() {
  console.log('🔌 Connecting to database…');
  await testConnection();
  console.log('✅ Database connected.\n');

  const pool = getPool();

  console.log('🔐 Hashing password (bcrypt, 12 rounds)…');
  const hashed = await bcrypt.hash(SUPER_ADMIN.password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert core.users — the real identity system of record.
    // NOTE: the ON CONFLICT target must repeat the partial index's WHERE
    // clause (migration 017 / 033) — Postgres can't infer a partial
    // unique index as an arbiter from a bare column list. The previous
    // version of this script used a bare `ON CONFLICT (email)`, which
    // would have failed at runtime against epdg.users' partial index
    // too; fixing it here since this statement is being rewritten anyway.
    const { rows: coreUserRows } = await client.query(
      `INSERT INTO core.users (email, name, password, is_verified, created_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE
         SET password    = EXCLUDED.password,
             name        = EXCLUDED.name,
             is_verified = true
       RETURNING id, name, email, is_verified`,
      [SUPER_ADMIN.email, SUPER_ADMIN.name, hashed]
    );
    const coreUser = coreUserRows[0];
    console.log('Core administrator identity upserted.');

    const { rows: branchRows } = await client.query(`SELECT id FROM core.branches WHERE code = 'epdg'`);
    if (!branchRows.length) {
      throw new Error("core.branches row for 'epdg' not found — has migration 033 run?");
    }
    const branchId = branchRows[0].id;

    // Upsert core.user_branch_roles — role/admin_role for the epdg branch.
    await client.query(
      `INSERT INTO core.user_branch_roles (user_id, branch_id, role_name, admin_role, created_at)
       VALUES ($1, $2, $3::core.user_role, 'super_admin'::core.admin_role, NOW())
       ON CONFLICT (user_id, branch_id) DO UPDATE
         SET role_name  = EXCLUDED.role_name,
             admin_role = 'super_admin'::core.admin_role`,
      [coreUser.id, branchId, SUPER_ADMIN.role]
    );
    console.log('Core branch authorization upserted.');

    // TEMPORARY: mirror into epdg.users, same id as core.users, purely so
    // existing epdg.* FK constraints (admins, ...) keep resolving. Not a
    // system of record — remove once those FKs are repointed at
    // core.users directly in a future migration.
    const { rows: epdgUserRows } = await client.query(
      `INSERT INTO epdg.users (id, name, email, password, role, is_verified, created_at)
       VALUES ($1, $2, $3, $4, $5::epdg.user_role, true, NOW())
       ON CONFLICT (id) DO UPDATE
         SET password    = EXCLUDED.password,
             role        = EXCLUDED.role,
             is_verified = true
       RETURNING id, name, email, role`,
      [coreUser.id, SUPER_ADMIN.name, SUPER_ADMIN.email, hashed, SUPER_ADMIN.role]
    );
    const user = epdgUserRows[0];
    console.log('EPDG compatibility identity upserted.');

    // Upsert epdg.admins row (super_admin rank) — untouched shape, still epdg-specific.
    await client.query(
      `INSERT INTO admins (user_id, admin_role, permissions, created_at, updated_at)
       VALUES ($1, 'super_admin'::admin_role, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET admin_role  = 'super_admin',
             permissions = EXCLUDED.permissions,
             updated_at  = NOW()
       RETURNING id, user_id, admin_role`,
      [user.id, JSON.stringify({ all: true })]
    );
    console.log('EPDG administrator profile upserted.');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Super-administrator seed completed.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Credential values were not written to logs.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  Store these credentials securely.\n');

  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Super-administrator seed failed.', { errorType: err?.name || 'Error' });
  process.exit(1);
});
