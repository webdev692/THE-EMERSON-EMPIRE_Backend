import { PoolClient } from 'pg';

export const EPDG_BRANCH_CODE = 'epdg';

export interface DualWriteUserInput {
  email: string;
  name: string;
  hashedPassword: string;
  role: 'admin' | 'company' | 'intern' | 'school';
  adminRole?: 'admin' | 'super_admin';
  isVerified?: boolean;
  verificationToken?: string | null;
  tokenExpiresAt?: Date | null;
}

/**
 * Creates a new identity in core.users + core.user_branch_roles (the real
 * system of record), and mirrors it into epdg.users using the same id
 * purely so existing epdg.* FK constraints (admins, companies, schools,
 * intern_profiles, ...) keep resolving.
 *
 * TEMPORARY: the epdg.users row this writes is a compatibility shim, not
 * a system of record — it exists only until a later task repoints those
 * FKs at core.users directly and this mirror write is removed.
 *
 * Must be called with a client already inside a transaction the caller
 * owns (BEGIN/COMMIT/ROLLBACK) — this function issues no transaction
 * control of its own, so the core write, role write, and epdg mirror
 * write all succeed or fail together with the rest of the caller's work.
 */
export async function createDualWriteUser(
  client: PoolClient,
  input: DualWriteUserInput,
): Promise<{ id: number; createdAt: Date }> {
  const isVerified = input.isVerified ?? false;

  const { rows: coreRows } = await client.query(
    `INSERT INTO core.users (email, name, password, is_verified, verification_token, token_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, created_at`,
    [
      input.email,
      input.name,
      input.hashedPassword,
      isVerified,
      input.verificationToken ?? null,
      input.tokenExpiresAt ?? null,
    ],
  );
  const coreUserId: number = coreRows[0].id;
  const createdAt: Date = coreRows[0].created_at;

  const { rows: branchRows } = await client.query(
    `SELECT id FROM core.branches WHERE code = $1`,
    [EPDG_BRANCH_CODE],
  );
  if (!branchRows.length) {
    throw new Error(`core.branches row for '${EPDG_BRANCH_CODE}' not found — has migration 033 run?`);
  }
  const branchId: number = branchRows[0].id;

  await client.query(
    `INSERT INTO core.user_branch_roles (user_id, branch_id, role_name, admin_role, created_at)
     VALUES ($1, $2, $3::core.user_role, $4::core.admin_role, NOW())`,
    [coreUserId, branchId, input.role, input.adminRole ?? null],
  );

  // TEMPORARY mirror — see function doc comment above.
  await client.query(
    `INSERT INTO epdg.users (id, email, name, password, role, is_verified, verification_token, token_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5::epdg.user_role, $6, $7, $8, NOW())`,
    [
      coreUserId,
      input.email,
      input.name,
      input.hashedPassword,
      input.role,
      isVerified,
      input.verificationToken ?? null,
      input.tokenExpiresAt ?? null,
    ],
  );

  return { id: coreUserId, createdAt };
}
