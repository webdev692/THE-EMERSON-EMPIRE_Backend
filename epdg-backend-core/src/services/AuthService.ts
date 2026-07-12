import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db';
import { logger } from '../utils/logger';
import { Resend } from 'resend';
import { createDualWriteUser } from '../utils/coreIdentity';
import { requireEnvironmentVariable } from '../config/env';

const SALT_ROUNDS = 12;

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

async function withTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      logger.error('Authentication transaction rollback failed');
    }
    throw error;
  } finally {
    client.release();
  }
}

function requireMirroredUpdates(
  coreResult: { rowCount: number | null },
  epdgResult: { rowCount: number | null },
): void {
  if (coreResult.rowCount !== 1 || epdgResult.rowCount !== 1) {
    throw new Error('Identity synchronization failed');
  }
}

export class AuthService {

  async register(data: {
    name: string;
    email: string;
    password: string;
    contact_phone?: string;
    role: 'company' | 'intern' | 'school';
    country?: string;
    county?: string;
    industry?: string;
    contact_person?: string;
    number_of_employees?: number;
    website?: string;
    city?: string;
    school_type?: 'university' | 'college' | 'polytechnic' | 'tvet';
    cover_letter?: string;
  }): Promise<{ user: any; message: string }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM core.users WHERE email = $1 AND deleted_at IS NULL',
        [data.email]
      );
      if (existing.rows.length > 0) {
        throw new Error('Email already registered');
      }

      const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
      const verificationToken = randomUUID();
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const { id: userId, createdAt } = await createDualWriteUser(client, {
        email: data.email,
        name: data.name,
        hashedPassword,
        role: data.role,
        isVerified: false,
        verificationToken,
        tokenExpiresAt,
      });

      const user = {
        id: userId,
        email: data.email,
        name: data.name,
        role: data.role,
        is_verified: false,
        last_login_at: null,
        created_at: createdAt,
      };

      if (data.role === 'company') {
        await client.query(
          `INSERT INTO companies (user_id, company_name, email, country, county, industry, number_of_employees, website, contact_person, contact_phone, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [user.id, data.name, data.email, data.country || null, data.county || null, data.industry || null,
           data.number_of_employees || null, data.website || null, data.contact_person || data.name, data.contact_phone || null]
        );
      } else if (data.role === 'school') {
        await client.query(
          `INSERT INTO schools (user_id, school_name, email, school_type, county, website, contact_person, contact_phone, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [user.id, data.name, data.email, data.school_type || 'university', data.city || data.county || null,
           data.website || null, data.contact_person || data.name, data.contact_phone || null]
        );
      } else if (data.role === 'intern') {
        await client.query(
          `INSERT INTO intern_profiles (user_id, contact_phone, cover_letter, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [user.id, data.contact_phone || null, data.cover_letter || null]
        );
      }

      await client.query('COMMIT');

      this.sendVerificationEmail(data.email, verificationToken).catch((err) => {
        logger.error('Failed to send verification email', err);
      });

      return {
        user,
        message: 'Registration saved. Verification email delivery is processed separately.',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(email: string, password: string, role: string): Promise<{
    token: string;
    user: {
      id: number;
      name: string;
      email: string;
      role: string;
      status: string;
      is_mentor: boolean;
      force_password_change: boolean;
      admin_role?: string;
    };
  }> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.email = $1 AND cu.deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_verified) {
      throw new Error('Please verify your email before logging in');
    }

    const branchRoleResult = await pool.query(
      `SELECT ubr.role_name, ubr.admin_role, ubr.rejection_reason
       FROM core.user_branch_roles ubr
       JOIN core.branches b ON b.id = ubr.branch_id
       WHERE ubr.user_id = $1 AND b.code = 'epdg'`,
      [user.id]
    );

    if (branchRoleResult.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const branchRole = branchRoleResult.rows[0];

    if (branchRole.role_name !== role) {
      throw new Error('Invalid email or password');
    }

    await withTransaction(async (client) => {
      const coreUpdate = await client.query(
        'UPDATE core.users SET last_login_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [user.id],
      );
      const epdgUpdate = await client.query(
        'UPDATE epdg.users SET last_login_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
        [user.id],
      );
      requireMirroredUpdates(coreUpdate, epdgUpdate);
    });

    let status = branchRole.rejection_reason ? 'rejected' : 'pending';
    let is_mentor = false;
    let force_password_change = false;
    const admin_role: string | undefined = branchRole.admin_role ?? undefined;

    if (branchRole.role_name === 'company') {
      const r = await pool.query(
        `SELECT c.is_approved, u.rejection_reason
         FROM epdg.companies c
         JOIN epdg.users u ON u.id = c.user_id AND u.deleted_at IS NULL
         WHERE c.user_id = $1 AND c.deleted_at IS NULL`,
        [user.id]
      );
      if (r.rows.length > 0) {
        status = branchRole.rejection_reason || r.rows[0].rejection_reason
          ? 'rejected'
          : r.rows[0].is_approved ? 'approved' : 'pending';
      }
    } else if (branchRole.role_name === 'school') {
      const r = await pool.query(
        `SELECT s.is_approved, u.rejection_reason
         FROM epdg.schools s
         JOIN epdg.users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE s.user_id = $1 AND s.deleted_at IS NULL`,
        [user.id]
      );
      if (r.rows.length > 0) {
        status = branchRole.rejection_reason || r.rows[0].rejection_reason
          ? 'rejected'
          : r.rows[0].is_approved ? 'approved' : 'pending';
      }
    } else if (branchRole.role_name === 'intern') {
      const r = await pool.query(
        'SELECT is_approved, rejection_reason FROM intern_profiles WHERE user_id = $1',
        [user.id]
      );
      if (r.rows.length > 0) {
        status = branchRole.rejection_reason || r.rows[0].rejection_reason
          ? 'rejected'
          : r.rows[0].is_approved ? 'approved' : 'pending';
      }
    } else if (branchRole.role_name === 'admin') {
      const r = await pool.query(
        'SELECT is_mentor, force_password_change FROM admins WHERE user_id = $1',
        [user.id]
      );
      if (r.rows.length > 0) {
        if (!branchRole.rejection_reason) status = 'approved';
        is_mentor             = r.rows[0].is_mentor             ?? false;
        force_password_change = r.rows[0].force_password_change ?? false;
      }
    }

    const token = this.generateToken(user, branchRole.role_name, admin_role);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: branchRole.role_name,
        status,
        is_mentor,
        force_password_change,
        admin_role,
      },
    };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const pool = getPool();

    const { rows } = await pool.query(
      'SELECT password FROM core.users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (!rows.length) throw new Error('User not found');

    const valid = await bcrypt.compare(currentPassword, rows[0].password);
    if (!valid) throw new Error('Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await withTransaction(async (client) => {
      const coreUpdate = await client.query(
        'UPDATE core.users SET password = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id',
        [hashed, userId],
      );
      const epdgUpdate = await client.query(
        'UPDATE epdg.users SET password = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id',
        [hashed, userId],
      );
      requireMirroredUpdates(coreUpdate, epdgUpdate);
      await client.query(
        'UPDATE epdg.admins SET force_password_change = FALSE WHERE user_id = $1',
        [userId],
      );
    });
  }

  async refreshToken(token: string): Promise<{ token: string }> {
    let decoded: { id?: unknown; purpose?: unknown };
    try {
      decoded = jwt.verify(
        token,
        requireEnvironmentVariable('JWT_SECRET'),
        { algorithms: ['HS256'] },
      ) as { id?: unknown; purpose?: unknown };
    } catch {
      throw new Error('Invalid access token');
    }
    if (
      decoded.purpose !== 'access' ||
      !Number.isInteger(decoded.id) ||
      Number(decoded.id) < 1
    ) {
      throw new Error('Invalid access token');
    }
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [Number(decoded.id)]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    const branchRoleResult = await pool.query(
      `SELECT ubr.role_name, ubr.admin_role
       FROM core.user_branch_roles ubr
       JOIN core.branches b ON b.id = ubr.branch_id
       WHERE ubr.user_id = $1 AND b.code = 'epdg'`,
      [user.id]
    );
    if (branchRoleResult.rows.length === 0) {
      throw new Error('User role not found');
    }
    const branchRole = branchRoleResult.rows[0];

    const newToken = this.generateToken(user, branchRole.role_name, branchRole.admin_role ?? undefined);

    return { token: newToken };
  }

  async verifyEmail(token: string): Promise<void> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.verification_token = $1 AND cu.deleted_at IS NULL`,
      [token]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }

    const user = result.rows[0];

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      throw new Error('Verification token has expired');
    }

    await withTransaction(async (client) => {
      const coreUpdate = await client.query(
        `UPDATE core.users
         SET is_verified = true, verification_token = NULL, token_expires_at = NULL
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [user.id],
      );
      const epdgUpdate = await client.query(
        `UPDATE epdg.users
         SET is_verified = true, verification_token = NULL, token_expires_at = NULL
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [user.id],
      );
      requireMirroredUpdates(coreUpdate, epdgUpdate);
    });
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.email = $1 AND cu.deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      return { message: 'If the email exists, a new verification link has been sent.' };
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return { message: 'Email is already verified' };
    }

    const verificationToken = randomUUID();
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await withTransaction(async (client) => {
      const coreUpdate = await client.query(
        `UPDATE core.users
         SET verification_token = $1, token_expires_at = $2
         WHERE id = $3 AND deleted_at IS NULL
         RETURNING id`,
        [verificationToken, tokenExpiresAt, user.id],
      );
      const epdgUpdate = await client.query(
        `UPDATE epdg.users
         SET verification_token = $1, token_expires_at = $2
         WHERE id = $3 AND deleted_at IS NULL
         RETURNING id`,
        [verificationToken, tokenExpiresAt, user.id],
      );
      requireMirroredUpdates(coreUpdate, epdgUpdate);
    });

    this.sendVerificationEmail(email, verificationToken).catch((err) => {
      logger.error('Failed to send verification email', err);
    });

    return { message: 'A new verification link has been sent to your email.' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.email = $1 AND cu.deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      return { message: 'Reset link sent.' };
    }

    const user = result.rows[0];
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password_reset' },
      requireEnvironmentVariable('JWT_SECRET'),
      { algorithm: 'HS256', expiresIn: '30m' }
    );

    const frontendBase = requireEnvironmentVariable('FRONTEND_URL').replace(/\/$/, '');
    const resetUrl = `${frontendBase}/reset-password?token=${resetToken}`;

    this.sendPasswordResetEmail(user.email, resetUrl).catch(() => {
      logger.error('Password reset email delivery failed');
    });

    return { message: 'Reset link sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let decoded: { id: number; purpose: string };
    try {
      decoded = jwt.verify(
        token,
        requireEnvironmentVariable('JWT_SECRET'),
        { algorithms: ['HS256'] },
      ) as { id: number; purpose: string };
    } catch {
      throw new Error('Invalid or expired reset token');
    }

    if (decoded.purpose !== 'password_reset') {
      throw new Error('Invalid reset token');
    }

    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.* FROM core.users cu
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await withTransaction(async (client) => {
      const coreUpdate = await client.query(
        'UPDATE core.users SET password = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id',
        [hashedPassword, decoded.id],
      );
      const epdgUpdate = await client.query(
        'UPDATE epdg.users SET password = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id',
        [hashedPassword, decoded.id],
      );
      requireMirroredUpdates(coreUpdate, epdgUpdate);
    });

    return { message: 'Password has been reset successfully.' };
  }

  async getMe(userId: number): Promise<any> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT cu.id, cu.email, cu.name, cu.is_verified, cu.last_login_at, cu.created_at,
              ubr.role_name AS role, ubr.admin_role
       FROM core.users cu
       JOIN core.user_branch_roles ubr ON ubr.user_id = cu.id
       JOIN core.branches b ON b.id = ubr.branch_id AND b.code = 'epdg'
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];
    let profile = null;

    if (user.role === 'company') {
      const r = await pool.query('SELECT * FROM companies WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
      profile = r.rows[0] || null;
    } else if (user.role === 'school') {
      const r = await pool.query('SELECT * FROM schools WHERE user_id = $1 AND deleted_at IS NULL', [userId]);
      profile = r.rows[0] || null;
    } else if (user.role === 'intern') {
      const r = await pool.query('SELECT * FROM intern_profiles WHERE user_id = $1', [userId]);
      profile = r.rows[0] || null;
    } else if (user.role === 'admin') {
      const r = await pool.query('SELECT * FROM admins WHERE user_id = $1', [userId]);
      profile = r.rows[0] || null;
    }

    return { ...user, profile };
  }

  async logout(): Promise<void> {
    return;
  }

  private generateToken(user: { id: number; email: string }, role: string, admin_role?: string): string {
    const payload: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      role,
      purpose: 'access',
    };
    if (admin_role) payload.admin_role = admin_role;
    return jwt.sign(payload, requireEnvironmentVariable('JWT_SECRET'), {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
  }

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${requireEnvironmentVariable('FRONTEND_URL').replace(/\/$/, '')}/verify-email?token=${token}`;

    const { error } = await getResend().emails.send({
      from: requireEnvironmentVariable('SMTP_FROM'),
      to: email,
      subject: 'Verify your email — Emerson Empire',
      html: `
        <!DOCTYPE html>
        <html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
                <tr><td style="background:#000000;padding:24px 40px;">
                  <h1 style="color:#ffffff;margin:0;font-size:22px;">Emerson Empire</h1>
                </td></tr>
                <tr><td style="padding:40px;">
                  <h2 style="color:#111;margin-top:0;">Verify your email address</h2>
                  <p style="color:#555;font-size:15px;line-height:1.6;">
                    Welcome! Click the button below to verify your email address and activate your account.
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:32px 0;">
                    <tr><td style="background:#000000;border-radius:6px;">
                      <a href="${verificationUrl}"
                         style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">
                        Verify Email Address
                      </a>
                    </td></tr>
                  </table>
                  <p style="color:#888;font-size:13px;">This link expires in <strong>24 hours</strong>.</p>
                  <p style="color:#888;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
                  <p style="color:#555;font-size:13px;word-break:break-all;">${verificationUrl}</p>
                  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
                  <p style="color:#aaa;font-size:12px;">If you did not create an account, you can safely ignore this email.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>
      `,
    });

    if (error) {
      logger.error('Verification email delivery failed');
    } else {
      logger.success('Verification email accepted by provider');
    }
  }

  private async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const { error } = await getResend().emails.send({
      from: requireEnvironmentVariable('SMTP_FROM'),
      to: email,
      subject: 'Reset your password — Emerson Empire',
      html: `
        <!DOCTYPE html>
        <html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
            <tr><td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
                <tr><td style="background:#000000;padding:24px 40px;">
                  <h1 style="color:#ffffff;margin:0;font-size:22px;">Emerson Empire</h1>
                </td></tr>
                <tr><td style="padding:40px;">
                  <h2 style="color:#111;margin-top:0;">Password Reset Request</h2>
                  <p style="color:#555;font-size:15px;line-height:1.6;">
                    We received a request to reset your password. Click the button below to choose a new one.
                    This link expires in <strong>30 minutes</strong>.
                  </p>
                  <table cellpadding="0" cellspacing="0" style="margin:32px 0;">
                    <tr><td style="background:#000000;border-radius:6px;">
                      <a href="${resetUrl}"
                         style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">
                        Reset Password
                      </a>
                    </td></tr>
                  </table>
                  <p style="color:#888;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
                  <p style="color:#555;font-size:13px;word-break:break-all;">${resetUrl}</p>
                  <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
                  <p style="color:#aaa;font-size:12px;">If you did not request a password reset, you can safely ignore this email.</p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body></html>
      `,
    });

    if (error) {
      logger.error('Password reset email delivery failed');
    } else {
      logger.success('Password reset email accepted by provider');
    }
  }
}
