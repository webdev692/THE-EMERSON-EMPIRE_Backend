import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db';
import { logger } from '../utils/logger';
import { Resend } from 'resend';

const JWT_SECRET = process.env.JWT_SECRET || 'default-dev-secret-change-in-production';
const SALT_ROUNDS = 12;

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export class AuthService {

  async register(data: {
    name: string;
    email: string;
    password: string;
    contact_phone?: string;
    role: 'admin' | 'company' | 'intern' | 'school';
    country?: string;
    county?: string;
    industry?: string;
    contact_person?: string;
    number_of_employees?: number;
    website?: string;
    city?: string;
    school_type?: 'university' | 'college' | 'polytechnic' | 'tvet';
    cover_letter?: string;
    cv_url?: string;
  }): Promise<{ user: any; message: string }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email]
      );
      if (existing.rows.length > 0) {
        throw new Error('Email already registered');
      }

      const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
      const verificationToken = uuidv4();
      const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const userResult = await client.query(
        `INSERT INTO users (email, name, password, role, verification_token, token_expires_at, created_at)
         VALUES ($1, $2, $3, $4::user_role, $5, $6, NOW())
         RETURNING id, email, name, role, is_verified, last_login_at, created_at`,
        [data.email, data.name, hashedPassword, data.role, verificationToken, tokenExpiresAt]
      );

      const user = userResult.rows[0];

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
          `INSERT INTO intern_profiles (user_id, contact_phone, cv_url, cover_letter, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [user.id, data.contact_phone || null, data.cv_url || null, data.cover_letter || null]
        );
      } else if (data.role === 'admin') {
        await client.query(
          `INSERT INTO admins (user_id, admin_role, is_mentor, created_at)
           VALUES ($1, 'admin', FALSE, NOW())`,
          [user.id]
        );
      }

      await client.query('COMMIT');

      this.sendVerificationEmail(data.email, verificationToken).catch((err) => {
        logger.error('Failed to send verification email', err);
      });

      return {
        user,
        message: 'Registration successful. Please check your email to verify your account.',
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
    user: { id: number; name: string; email: string; role: string; status: string };
  }> {
    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    if (user.role !== role) {
      throw new Error('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_verified) {
      throw new Error('Please verify your email before logging in');
    }

    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );

    let status = 'approved';

    if (user.role === 'company') {
      const r = await pool.query(
        'SELECT is_approved FROM companies WHERE user_id = $1 AND deleted_at IS NULL',
        [user.id]
      );
      if (r.rows.length > 0 && !r.rows[0].is_approved) {
        status = user.rejection_reason ? 'rejected' : 'pending';
      }
    } else if (user.role === 'school') {
      const r = await pool.query(
        'SELECT is_approved FROM schools WHERE user_id = $1 AND deleted_at IS NULL',
        [user.id]
      );
      if (r.rows.length > 0 && !r.rows[0].is_approved) {
        status = user.rejection_reason ? 'rejected' : 'pending';
      }
    } else if (user.role === 'intern') {
      const r = await pool.query(
        'SELECT is_approved, rejection_reason FROM intern_profiles WHERE user_id = $1',
        [user.id]
      );
      if (r.rows.length > 0 && !r.rows[0].is_approved) {
        status = r.rows[0].rejection_reason ? 'rejected' : 'pending';
      }
    }

    const token = this.generateToken(user);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status,
      },
    };
  }

  async refreshToken(token: string): Promise<{ token: string }> {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const newToken = this.generateToken(result.rows[0]);

    return { token: newToken };
  }

  async verifyEmail(token: string): Promise<void> {
    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE verification_token = $1 AND deleted_at IS NULL',
      [token]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }

    const user = result.rows[0];

    if (user.token_expires_at && new Date(user.token_expires_at) < new Date()) {
      throw new Error('Verification token has expired');
    }

    await pool.query(
      'UPDATE users SET is_verified = true, verification_token = NULL, token_expires_at = NULL WHERE id = $1',
      [user.id]
    );
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      return { message: 'If the email exists, a new verification link has been sent.' };
    }

    const user = result.rows[0];

    if (user.is_verified) {
      return { message: 'Email is already verified' };
    }

    const verificationToken = uuidv4();
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_token = $1, token_expires_at = $2 WHERE id = $3',
      [verificationToken, tokenExpiresAt, user.id]
    );

    this.sendVerificationEmail(email, verificationToken).catch((err) => {
      logger.error('Failed to send verification email', err);
    });

    return { message: 'A new verification link has been sent to your email.' };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );

    if (result.rows.length === 0) {
      return { message: 'Reset link sent.' };
    }

    const user = result.rows[0];
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

    logger.warn(`Dev mode — password reset URL: ${resetUrl}`);

    this.sendPasswordResetEmail(user.email, resetUrl).catch((err) => {
      logger.error('Failed to send password reset email', err);
    });

    return { message: 'Reset link sent.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let decoded: { id: number; purpose: string };
    try {
      decoded = jwt.verify(token, JWT_SECRET) as { id: number; purpose: string };
    } catch {
      throw new Error('Invalid or expired reset token');
    }

    if (decoded.purpose !== 'password_reset') {
      throw new Error('Invalid reset token');
    }

    const pool = getPool();

    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, decoded.id]
    );

    return { message: 'Password has been reset successfully.' };
  }

  async getMe(userId: number): Promise<any> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, email, name, role, is_verified, last_login_at, created_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
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

  private generateToken(user: any): string {
    const payload = { id: user.id, email: user.email, role: user.role };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  }

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

    const { data, error } = await getResend().emails.send({
      from: process.env.SMTP_FROM || 'onboarding@resend.dev',
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
      logger.error(`Resend failed to send verification email: ${JSON.stringify(error)}`);
      logger.warn(`Verification URL (fallback): ${verificationUrl}`);
    } else {
      logger.success(`Verification email sent to ${email} — id: ${data?.id}`);
    }
  }

  private async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    const { data, error } = await getResend().emails.send({
      from: process.env.SMTP_FROM || 'onboarding@resend.dev',
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
      logger.error(`Resend failed to send password reset email: ${JSON.stringify(error)}`);
      logger.warn(`Reset URL (fallback): ${resetUrl}`);
    } else {
      logger.success(`Password reset email sent to ${email} — id: ${data?.id}`);
    }
  }
}
