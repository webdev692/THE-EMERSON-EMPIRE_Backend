import bcrypt from 'bcrypt';
import { getPool } from '../db';

export class AdminService {

  // ─── Stats ──────────────────────────────────────────────────────────────────

  async getStats() {
    const pool = getPool();

    const [companies, schools, interns, placements, pendingCo, pendingSch, pendingInt] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) FROM users WHERE role='company' AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM users WHERE role='school'  AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM users WHERE role='intern'  AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM placements WHERE status='active'`),
        pool.query(`
          SELECT u.name, u.created_at FROM companies c
          JOIN users u ON u.id = c.user_id
          WHERE c.is_approved = false AND u.is_verified = true AND u.deleted_at IS NULL
          ORDER BY u.created_at DESC LIMIT 5
        `),
        pool.query(`
          SELECT u.name, u.created_at FROM schools s
          JOIN users u ON u.id = s.user_id
          WHERE s.is_approved = false AND u.is_verified = true AND u.deleted_at IS NULL
          ORDER BY u.created_at DESC LIMIT 5
        `),
        pool.query(`
          SELECT COUNT(*) FROM intern_profiles ip
          JOIN users u ON u.id = ip.user_id
          WHERE ip.is_approved = false AND u.is_verified = true AND u.deleted_at IS NULL
        `),
      ]);

    const pendingTotal =
      Number(pendingCo.rows.length) +
      Number(pendingSch.rows.length) +
      Number(pendingInt.rows[0].count);

    return {
      companies:        Number(companies.rows[0].count),
      schools:          Number(schools.rows[0].count),
      interns:          Number(interns.rows[0].count),
      active_placements: Number(placements.rows[0].count),
      pending_approvals: pendingTotal,
      pending_companies: pendingCo.rows,
      pending_schools:   pendingSch.rows,
      pending_interns:   Number(pendingInt.rows[0].count),
    };
  }

  // ─── List users ─────────────────────────────────────────────────────────────

  async getUsers(filters: { role?: string; status?: string; search?: string }) {
    const pool = getPool();

    // Build a normalised view across all roles
    const rows = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.is_verified,
        u.created_at,
        u.last_login_at,
        u.rejection_reason,
        -- intern fields
        ip.is_approved      AS intern_approved,
        ip.rejection_reason AS intern_rejection,
        ip.cover_letter,
        ip.cv_url,
        ip.contact_phone    AS intern_phone,
        -- company fields
        c.company_name,
        c.is_approved    AS company_approved,
        c.industry,
        c.contact_person AS company_contact,
        c.country,
        c.county,
        c.website        AS company_website,
        c.number_of_employees,
        -- school fields
        s.school_name,
        s.is_approved    AS school_approved,
        s.school_type,
        s.contact_person AS school_contact,
        s.county         AS school_city,
        s.website        AS school_website
      FROM users u
      LEFT JOIN intern_profiles ip ON ip.user_id = u.id AND u.role = 'intern'
      LEFT JOIN companies        c  ON c.user_id  = u.id AND u.role = 'company'
      LEFT JOIN schools          s  ON s.user_id  = u.id AND u.role = 'school'
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `);

    let users = rows.rows.map((r) => this.normalise(r));

    if (filters.role)   users = users.filter((u) => u.role   === filters.role);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      users = users.filter((u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (filters.status) users = users.filter((u) => u.status === filters.status);

    return users;
  }

  // ─── Approve / reject ────────────────────────────────────────────────────────

  async updateUserStatus(
    userId: number,
    adminId: number,
    payload: {
      status:           'approved' | 'rejected';
      rejection_reason?: string;
      department?:       string;
      mentor?:           string;
    }
  ) {
    const pool   = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch user + role
      const { rows } = await client.query(
        'SELECT id, role, name FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );
      if (!rows.length) throw new Error('User not found');
      const user = rows[0];

      if (payload.status === 'approved') {
        await this.approve(client, user, adminId, payload);
      } else {
        await this.reject(client, user, payload.rejection_reason || '');
      }

      await client.query('COMMIT');

      // Return updated normalised user
      const updated = await pool.query(`
        SELECT u.*, ip.is_approved AS intern_approved, c.is_approved AS company_approved, s.is_approved AS school_approved,
               c.industry, c.contact_person AS company_contact, c.country, c.county, c.website AS company_website,
               s.school_type, s.contact_person AS school_contact, s.county AS school_city
        FROM users u
        LEFT JOIN intern_profiles ip ON ip.user_id = u.id AND u.role = 'intern'
        LEFT JOIN companies c        ON c.user_id  = u.id AND u.role = 'company'
        LEFT JOIN schools   s        ON s.user_id  = u.id AND u.role = 'school'
        WHERE u.id = $1
      `, [userId]);

      return this.normalise(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Delete (soft) ───────────────────────────────────────────────────────────

  async deleteUser(userId: number) {
    const pool = getPool();
    await pool.query(
      'UPDATE users SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
  }

  // ─── Create user manually ────────────────────────────────────────────────────

  async createUser(data: {
    name: string; email: string; password: string;
    role: 'admin' | 'company' | 'intern' | 'school';
  }) {
    const pool   = getPool();
    const hashed = await bcrypt.hash(data.password, 12);

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role, is_verified, created_at)
       VALUES ($1, $2, $3, $4::user_role, true, NOW())
       RETURNING id, name, email, role, is_verified, created_at`,
      [data.name, data.email, hashed, data.role]
    );
    return rows[0];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async approve(client: any, user: any, adminId: number, payload: any) {
    const now = new Date();

    // When admin approves any user, also mark their email as verified
    await client.query(
      'UPDATE users SET is_verified=true, verification_token=NULL, token_expires_at=NULL WHERE id=$1',
      [user.id]
    );

    if (user.role === 'company') {
      await client.query(
        `UPDATE companies SET is_approved=true, approved_by=$1, approved_at=$2
         WHERE user_id=$3`,
        [adminId, now, user.id]
      );
      await client.query(
        'UPDATE users SET rejection_reason=NULL WHERE id=$1',
        [user.id]
      );
    } else if (user.role === 'school') {
      await client.query(
        `UPDATE schools SET is_approved=true, approved_by=$1, approved_at=$2
         WHERE user_id=$3`,
        [adminId, now, user.id]
      );
      await client.query(
        'UPDATE users SET rejection_reason=NULL WHERE id=$1',
        [user.id]
      );
    } else if (user.role === 'intern') {
      const fields = ['is_approved=$1', 'approved_by=$2', 'approved_at=$3', 'rejection_reason=$4'];
      const values: unknown[] = [true, adminId, now, null];

      if (payload.department) { fields.push(`department=$${values.length + 1}`); values.push(payload.department); }
      if (payload.mentor)     { fields.push(`mentor_name=$${values.length + 1}`); values.push(payload.mentor); }

      values.push(user.id);
      await client.query(
        `UPDATE intern_profiles SET ${fields.join(', ')} WHERE user_id=$${values.length}`,
        values
      );
      await client.query(
        'UPDATE users SET rejection_reason=NULL WHERE id=$1',
        [user.id]
      );
    } else if (user.role === 'admin') {
      await client.query(
        'UPDATE admins SET updated_at=NOW() WHERE user_id=$1',
        [user.id]
      );
    }
  }

  private async reject(client: any, user: any, reason: string) {
    await client.query(
      'UPDATE users SET rejection_reason=$1 WHERE id=$2',
      [reason, user.id]
    );

    if (user.role === 'company') {
      await client.query(
        'UPDATE companies SET is_approved=false WHERE user_id=$1',
        [user.id]
      );
    } else if (user.role === 'school') {
      await client.query(
        'UPDATE schools SET is_approved=false WHERE user_id=$1',
        [user.id]
      );
    } else if (user.role === 'intern') {
      await client.query(
        'UPDATE intern_profiles SET is_approved=false, rejection_reason=$1 WHERE user_id=$2',
        [reason, user.id]
      );
    }
  }

  private normalise(r: any) {
    // Compute unified status
    let status: string;
    if (!r.is_verified) {
      status = 'unverified';
    } else if (r.role === 'company') {
      status = r.company_approved ? 'approved' : (r.rejection_reason ? 'rejected' : 'pending');
    } else if (r.role === 'school') {
      status = r.school_approved  ? 'approved' : (r.rejection_reason ? 'rejected' : 'pending');
    } else if (r.role === 'intern') {
      status = r.intern_approved  ? 'approved' : (r.rejection_reason || r.intern_rejection ? 'rejected' : 'pending');
    } else {
      status = 'approved'; // admin is always approved
    }

    return {
      id:                   r.id,
      name:                 r.name,
      email:                r.email,
      role:                 r.role,
      status,
      is_verified:          r.is_verified,
      created_at:           r.created_at,
      last_login_at:        r.last_login_at,
      rejection_reason:     r.rejection_reason || r.intern_rejection || null,
      // role-specific
      phone:                r.intern_phone      || null,
      cover_letter:         r.cover_letter      || null,
      cv_url:               r.cv_url            || null,
      industry:             r.industry         || null,
      contact_person:       r.company_contact  || r.school_contact  || null,
      country:              r.country          || null,
      county:               r.county           || r.school_city     || null,
      website:              r.company_website  || r.school_website  || null,
      number_of_employees:  r.number_of_employees || null,
      school_type:          r.school_type      || null,
    };
  }
}
