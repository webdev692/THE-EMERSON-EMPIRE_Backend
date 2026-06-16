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

  // Upsert user row
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (name, email, password, role, is_verified, created_at)
     VALUES ($1, $2, $3, $4::user_role, true, NOW())
     ON CONFLICT (email) DO UPDATE
       SET password    = EXCLUDED.password,
           role        = EXCLUDED.role,
           is_verified = true
     RETURNING id, name, email, role, is_verified`,
    [SUPER_ADMIN.name, SUPER_ADMIN.email, hashed, SUPER_ADMIN.role]
  );

  const user = userRows[0];
  console.log(`✅ User upserted: id=${user.id}, email=${user.email}, role=${user.role}`);

  // Upsert admins row (super_admin rank)
  const { rows: adminRows } = await pool.query(
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
  console.log(`✅ Admin row upserted: id=${admin.id}, user_id=${admin.user_id}, role=${admin.admin_role}\n`);

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
