/**
 * Seed Super Admin
 * Run: npx ts-node src/scripts/seed-super-admin.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import { getPool, testConnection } from '../db';

const password = process.env.SUPER_ADMIN_PASSWORD;
if (!password) {
  console.error('❌ SUPER_ADMIN_PASSWORD env var is not set. Aborting.');
  process.exit(1);
}

const SUPER_ADMIN = {
  name:     process.env.SUPER_ADMIN_NAME  || 'Emerson Admin',
  email:    process.env.SUPER_ADMIN_EMAIL || 'admin@theemersonempire.info',
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
    console.log(`✅ core.users upserted: id=${coreUser.id}, email=${coreUser.email}`);

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
    console.log(`✅ core.user_branch_roles upserted: user_id=${coreUser.id}, branch_id=${branchId}, role=super_admin`);

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
    console.log(`✅ epdg.users mirror upserted: id=${user.id}, email=${user.email}, role=${user.role}`);

    // Upsert epdg.admins row (super_admin rank) — untouched shape, still epdg-specific.
    const { rows: adminRows } = await client.query(
      `INSERT INTO admins (user_id, admin_role, permissions, created_at, updated_at)
       VALUES ($1, 'super_admin'::admin_role, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET admin_role  = 'super_admin',
             permissions = EXCLUDED.permissions,
             updated_at  = NOW()
       RETURNING id, user_id, admin_role`,
      [user.id, JSON.stringify({ all: true })]
    );
    const admin = adminRows[0];
    console.log(`✅ epdg.admins row upserted: id=${admin.id}, user_id=${admin.user_id}, role=${admin.admin_role}\n`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Super Admin Credentials');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Email:    ${SUPER_ADMIN.email}`);
  console.log(`   Password: (set via SUPER_ADMIN_PASSWORD env var)`);
  console.log(`   Role:     super_admin`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  Store these credentials securely.\n');

  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
