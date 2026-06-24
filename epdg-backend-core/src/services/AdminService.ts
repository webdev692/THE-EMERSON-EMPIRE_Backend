import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Resend } from 'resend';
import { getPool } from '../db';
import { logger } from '../utils/logger';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join('');
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = () => process.env.SMTP_FROM || 'noreply@theemersonempire.info';
const FRONTEND = () => (process.env.FRONTEND_URL || 'https://epdg.netlify.app').replace(/\/$/, '');

export class AdminService {

  // ─── Stats ──────────────────────────────────────────────────────────────────

  async getStats() {
    const pool = getPool();

    const [companies, schools, interns, placements, certs, pendingCo, pendingSch, pendingInt] =
      await Promise.all([
        pool.query(`SELECT COUNT(*) FROM users WHERE role='company' AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM users WHERE role='school'  AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM users WHERE role='intern'  AND deleted_at IS NULL`),
        pool.query(`SELECT COUNT(*) FROM placements WHERE status='active'`),
        pool.query(`SELECT COUNT(*) FROM certificates WHERE status='active'`),
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
      companies:         Number(companies.rows[0].count),
      schools:           Number(schools.rows[0].count),
      interns:           Number(interns.rows[0].count),
      active_placements: Number(placements.rows[0].count),
      certificates:      Number(certs.rows[0].count),
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
        ip.course,
        ip.department       AS intern_department,
        ip.mentor_name,
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

      // Fire-and-forget notification email
      const emailRow = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );
      if (emailRow.rows.length) {
        if (payload.status === 'approved') {
          this.sendApprovalEmail(
            emailRow.rows[0].email,
            user.name,
            user.role,
            payload.department,
            payload.mentor
          );
        } else {
          this.sendRejectionEmail(
            emailRow.rows[0].email,
            user.name,
            payload.rejection_reason || ''
          );
        }
      }

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
    name: string; email: string;
    role: 'admin' | 'company' | 'intern' | 'school';
    admin_type?: 'general' | 'mentor' | 'technical_support' | 'operations';
    department?: string;
    max_capacity?: number;
  }) {
    const pool   = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [data.email]
      );
      if (existing.rows.length) throw new Error('Email already in use.');

      const plainPassword = generateTempPassword();

      const hashed = await bcrypt.hash(plainPassword, 12);
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password, role, is_verified, created_at)
         VALUES ($1, $2, $3, $4::user_role, true, NOW())
         RETURNING id, name, email, role, is_verified, created_at`,
        [data.name, data.email, hashed, data.role]
      );
      const user = rows[0];

      if (data.role === 'admin') {
        const adminType  = data.admin_type  || 'general';
        const isMentor   = adminType === 'mentor';
        const dept       = data.department  || null;
        const maxCap     = data.max_capacity || 3;

        await client.query(
          `INSERT INTO admins (user_id, admin_role, is_mentor, admin_type, department, max_capacity, force_password_change, created_at)
           VALUES ($1, 'admin', $2, $3, $4, $5, TRUE, NOW())`,
          [user.id, isMentor, adminType, dept, maxCap]
        );

        this.sendAdminWelcomeEmail(data.email, data.name, plainPassword, adminType, dept);
      } else {
        this.sendUserWelcomeEmail(data.email, data.name, plainPassword, data.role);
      }

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Placements ──────────────────────────────────────────────────────────────

  async getPlaceableInterns() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        a.id               AS application_id,
        u.id               AS user_id,
        u.name             AS intern_name,
        u.email            AS intern_email,
        ip.id              AS intern_profile_id,
        s.id               AS slot_id,
        s.title            AS slot_title,
        s.department,
        s.duration_weeks,
        c.id               AS company_id,
        c.company_name,
        sc.id              AS school_id
      FROM applications a
      JOIN intern_profiles  ip ON ip.id  = a.intern_id
      JOIN users            u  ON u.id   = ip.user_id
      JOIN internship_slots s  ON s.id   = a.slot_id
      JOIN companies        c  ON c.id   = s.company_id
      LEFT JOIN schools     sc ON sc.user_id = u.id
      WHERE a.status = 'approved'
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM placements p WHERE p.application_id = a.id
        )
      ORDER BY u.name
    `);
    return rows;
  }

  async createPlacement(data: {
    application_id: number;
    intern_id: number;
    company_id: number;
    school_id: number | null;
    slot_id: number;
    mentor_id: number | null;
    start_date: string;
    end_date: string;
  }) {
    const pool = getPool();

    // Verify application exists and is approved
    const appCheck = await pool.query(
      `SELECT id FROM applications WHERE id = $1 AND status = 'approved'`,
      [data.application_id]
    );
    if (!appCheck.rows.length) throw new Error('Application not found or not approved.');

    // Prevent duplicate placement
    const dupCheck = await pool.query(
      `SELECT id FROM placements WHERE application_id = $1`, [data.application_id]
    );
    if (dupCheck.rows.length) throw new Error('A placement already exists for this application.');

    const { rows } = await pool.query(
      `INSERT INTO placements
         (application_id, intern_id, company_id, school_id, slot_id, mentor_id, start_date, end_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())
       RETURNING id`,
      [
        data.application_id, data.intern_id, data.company_id,
        data.school_id || null, data.slot_id,
        data.mentor_id || null, data.start_date, data.end_date,
      ]
    );
    return rows[0];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  // ─── Mentors ─────────────────────────────────────────────────────────────────

  async getMentors() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        u.id, u.name, u.email, a.department,
        COALESCE(a.max_capacity, 3) AS max_capacity,
        (SELECT COUNT(*) FROM intern_profiles ip WHERE ip.mentor_name = u.name)::int AS assigned_count
      FROM admins a
      JOIN users u ON u.id = a.user_id
      WHERE a.is_mentor = true AND u.deleted_at IS NULL
      ORDER BY u.name
    `);
    return rows;
  }

  async createMentor(data: {
    name: string;
    email: string;
    password: string;
    department: string;
    max_capacity: number;
  }) {
    const pool   = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [data.email]
      );
      if (existing.rows.length) throw new Error('Email already in use.');

      const hashed = await bcrypt.hash(data.password, 10);

      const { rows: [user] } = await client.query(
        `INSERT INTO users (name, email, password, role, is_verified, created_at)
         VALUES ($1, $2, $3, 'admin', TRUE, NOW()) RETURNING id`,
        [data.name, data.email, hashed]
      );

      await client.query(
        `INSERT INTO admins (user_id, admin_role, is_mentor, department, max_capacity, force_password_change, created_at)
         VALUES ($1, 'admin', TRUE, $2, $3, TRUE, NOW())`,
        [user.id, data.department, data.max_capacity]
      );

      await client.query('COMMIT');

      // Fire-and-forget welcome email with temporary password
      this.sendMentorWelcomeEmail(data.email, data.name, data.password, data.department);

      return {
        id:             user.id,
        name:           data.name,
        email:          data.email,
        department:     data.department,
        max_capacity:   data.max_capacity,
        assigned_count: 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deactivateMentor(userId: number) {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `UPDATE admins SET is_mentor = FALSE WHERE user_id = $1`,
      [userId]
    );
    if (!rowCount) throw new Error('Mentor not found.');
  }

  async resetMentorPassword(userId: number, newPassword: string) {
    const pool   = getPool();
    const hashed = await bcrypt.hash(newPassword, 10);

    const { rows } = await pool.query(
      `SELECT u.email, u.name FROM users u
       JOIN admins a ON a.user_id = u.id
       WHERE u.id = $1 AND a.is_mentor = TRUE AND u.deleted_at IS NULL`,
      [userId]
    );
    if (!rows.length) throw new Error('Mentor not found.');

    await pool.query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashed, userId]
    );
    await pool.query(
      `UPDATE admins SET force_password_change = TRUE WHERE user_id = $1`,
      [userId]
    );

    this.sendMentorWelcomeEmail(rows[0].email, rows[0].name, newPassword, '(unchanged)');
    return { email: rows[0].email, name: rows[0].name };
  }

  // ─── Internship Slots ────────────────────────────────────────────────────────

  async getSlots(filters: { status?: string; department?: string } = {}) {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        s.id, s.title, s.department, s.description, s.requirements,
        s.skills_required, s.slots_available, s.slots_filled,
        s.duration_weeks, s.stipend, s.is_remote, s.county,
        s.deadline, s.status, s.created_at,
        c.company_name,
        u.name AS created_by_name
      FROM internship_slots s
      LEFT JOIN companies c ON c.id = s.company_id
      LEFT JOIN users     u ON u.id = s.created_by
      WHERE s.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `);

    let slots = rows;
    if (filters.status)     slots = slots.filter((s) => s.status     === filters.status);
    if (filters.department) slots = slots.filter((s) => s.department === filters.department);
    return slots;
  }

  async createSlot(data: {
    title: string;
    department?: string;
    description?: string;
    requirements?: string;
    skills_required?: string[];
    slots_available?: number;
    duration_weeks?: number;
    stipend?: number;
    is_remote?: boolean;
    county?: string;
    deadline?: string;
    status?: string;
    company_id?: number;
    created_by?: number;
  }) {
    const pool = getPool();
    const { rows } = await pool.query(`
      INSERT INTO internship_slots (
        title, department, description, requirements, skills_required,
        slots_available, duration_weeks, stipend, is_remote, county,
        deadline, status, company_id, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb,
        $6, $7, $8, $9, $10,
        $11, $12::internship_slot_status, $13, $14, NOW()
      ) RETURNING *
    `, [
      data.title,
      data.department   || null,
      data.description  || null,
      data.requirements || null,
      data.skills_required ? JSON.stringify(data.skills_required) : null,
      data.slots_available ?? 1,
      data.duration_weeks  || null,
      data.stipend         || null,
      data.is_remote       ?? false,
      data.county          || null,
      data.deadline        || null,
      data.status          || 'draft',
      data.company_id      || null,
      data.created_by      || null,
    ]);
    return rows[0];
  }

  async updateSlot(id: number, data: {
    title?: string;
    department?: string;
    description?: string;
    requirements?: string;
    skills_required?: string[];
    slots_available?: number;
    duration_weeks?: number;
    stipend?: number;
    is_remote?: boolean;
    county?: string;
    deadline?: string;
    status?: string;
  }) {
    const pool = getPool();

    const fields: string[] = [];
    const values: unknown[] = [];

    const add = (col: string, val: unknown) => {
      if (val !== undefined) { fields.push(`${col}=$${values.length + 1}`); values.push(val); }
    };

    add('title',           data.title);
    add('department',      data.department);
    add('description',     data.description);
    add('requirements',    data.requirements);
    add('slots_available', data.slots_available);
    add('duration_weeks',  data.duration_weeks);
    add('stipend',         data.stipend);
    add('is_remote',       data.is_remote);
    add('county',          data.county);
    add('deadline',        data.deadline);
    if (data.status)          { fields.push(`status=$${values.length + 1}::internship_slot_status`); values.push(data.status); }
    if (data.skills_required) { fields.push(`skills_required=$${values.length + 1}::jsonb`);          values.push(JSON.stringify(data.skills_required)); }

    if (!fields.length) throw new Error('No fields to update');

    values.push(id);
    const { rows } = await pool.query(
      `UPDATE internship_slots SET ${fields.join(', ')} WHERE id=$${values.length} AND deleted_at IS NULL RETURNING *`,
      values
    );
    if (!rows.length) throw new Error('Slot not found');
    return rows[0];
  }

  async deleteSlot(id: number) {
    const pool = getPool();
    await pool.query(
      'UPDATE internship_slots SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  // ─── Placements ──────────────────────────────────────────────────────────────

  async listPlacements() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        p.id,
        u.name        AS intern_name,
        u.email       AS intern_email,
        c.company_name,
        s.department,
        mu.name       AS mentor_name,
        p.start_date,
        p.end_date,
        p.status,
        p.termination_reason,
        ROUND(LEAST(100, GREATEST(0,
          EXTRACT(EPOCH FROM (NOW() - p.start_date))::float
          / NULLIF(EXTRACT(EPOCH FROM (p.end_date - p.start_date))::float, 0)
          * 100
        )))::int AS progress_percent
      FROM placements p
      JOIN intern_profiles ip ON ip.id  = p.intern_id
      JOIN users           u  ON u.id   = ip.user_id
      JOIN companies       c  ON c.id   = p.company_id
      JOIN internship_slots s ON s.id   = p.slot_id
      LEFT JOIN users mu ON mu.id = p.mentor_id
      WHERE u.deleted_at IS NULL
      ORDER BY p.start_date DESC
    `);

    return rows.map((r) => {
      let status = r.status as string;
      if (status === 'on_hold') status = 'active';
      if (status === 'active') {
        const endDate  = new Date(r.end_date);
        const twoWeeks = new Date();
        twoWeeks.setDate(twoWeeks.getDate() + 14);
        if (endDate <= twoWeeks) status = 'ending_soon';
      }
      const name = r.intern_name as string;
      return {
        id:              r.id,
        internName:      name,
        internInitials:  name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(),
        internEmail:     r.intern_email,
        company:         r.company_name,
        department:      r.department  || '',
        mentor:          r.mentor_name || '',
        startDate:       r.start_date,
        endDate:         r.end_date,
        status,
        progressPercent: Number(r.progress_percent),
        notes:           r.termination_reason || '',
      };
    });
  }

  async endPlacement(id: number, reason: string) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE placements SET status='terminated', termination_reason=$1, completed_at=NOW()
       WHERE id=$2 AND status IN ('active','on_hold') RETURNING id`,
      [reason, id]
    );
    if (!rows.length) throw new Error('Placement not found or already ended.');
  }

  // ─── Announcements ────────────────────────────────────────────────────────────

  async listAnnouncements() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT a.id, a.subject, a.message, a.target_audience, a.total_recipients, a.created_at,
             u.name AS created_by_name
      FROM announcements a
      LEFT JOIN users u ON u.id = a.created_by
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    return rows;
  }

  async createAnnouncement(data: {
    subject: string;
    message: string;
    targetAudience: string;
    createdBy: number;
  }) {
    const pool = getPool();
    const audienceFilter: Record<string, string> = {
      interns:   `role='intern'`,
      companies: `role='company'`,
      schools:   `role='school'`,
      mentors:   `id IN (SELECT user_id FROM admins WHERE is_mentor=TRUE)`,
    };
    let countQ = `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL`;
    if (data.targetAudience !== 'all' && audienceFilter[data.targetAudience]) {
      countQ += ` AND ${audienceFilter[data.targetAudience]}`;
    }
    const countRes        = await pool.query(countQ);
    const totalRecipients = Number(countRes.rows[0].count);

    const { rows } = await pool.query(
      `INSERT INTO announcements (subject, message, target_audience, created_by, total_recipients, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [data.subject, data.message, data.targetAudience, data.createdBy, totalRecipients]
    );
    return rows[0];
  }

  // ─── Gamification ────────────────────────────────────────────────────────────

  async getLeaderboard() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.name,
        COALESCE(ip.department, '') AS department,
        COALESCE(SUM(pe.points), 0)::int AS total_points,
        COALESCE(SUM(CASE WHEN pe.created_at >= DATE_TRUNC('month', NOW()) THEN pe.points ELSE 0 END), 0)::int AS month_points,
        COALESCE(SUM(CASE WHEN pe.created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
                           AND pe.created_at < DATE_TRUNC('month', NOW()) THEN pe.points ELSE 0 END), 0)::int AS prev_month_points
      FROM users u
      JOIN intern_profiles ip ON ip.user_id = u.id
      LEFT JOIN point_events pe ON pe.user_id = u.id
      WHERE u.role = 'intern' AND u.deleted_at IS NULL
      GROUP BY u.id, u.name, ip.department
      ORDER BY total_points DESC
      LIMIT 20
    `);

    const ids = rows.map((r) => r.id);
    const badgesRes = ids.length
      ? await pool.query(
          `SELECT ba.user_id, b.name FROM badge_awards ba JOIN badges b ON b.id = ba.badge_id WHERE ba.user_id = ANY($1)`,
          [ids]
        )
      : { rows: [] };

    const byUser: Record<number, string[]> = {};
    for (const b of badgesRes.rows) {
      if (!byUser[b.user_id]) byUser[b.user_id] = [];
      byUser[b.user_id].push(b.name);
    }

    return rows.map((r, idx) => {
      const trend: 'up' | 'down' | 'stable' =
        r.month_points > r.prev_month_points ? 'up' :
        r.month_points < r.prev_month_points ? 'down' : 'stable';
      const name = r.name as string;
      return {
        id:          r.id,
        name,
        initials:    name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(),
        company:     '',
        department:  r.department,
        totalPoints: r.total_points,
        monthPoints: r.month_points,
        rank:        idx + 1,
        badges:      byUser[r.id] || [],
        trend,
      };
    });
  }

  async getAuditLog() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT pe.id, u.name AS intern_name, pe.action, pe.points,
             pe.created_at AS date, au.name AS awarded_by
      FROM point_events pe
      JOIN users u  ON u.id  = pe.user_id
      LEFT JOIN users au ON au.id = pe.awarded_by
      ORDER BY pe.created_at DESC
      LIMIT 100
    `);
    return rows.map((r) => ({
      id:         r.id,
      internName: r.intern_name,
      action:     r.action,
      points:     r.points,
      date:       new Date(r.date).toISOString().slice(0, 10),
      awardedBy:  r.awarded_by || 'System',
    }));
  }

  async listBadges() {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT b.id, b.name, b.emoji, b.description,
             COUNT(ba.id)::int AS times_awarded
      FROM badges b
      LEFT JOIN badge_awards ba ON ba.badge_id = b.id
      GROUP BY b.id, b.name, b.emoji, b.description
      ORDER BY b.id
    `);
    return rows;
  }

  async adjustPoints(data: {
    userId: number; points: number; action: string; awardedBy: number;
  }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT u.id, u.name FROM users u WHERE u.id=$1 AND u.role='intern' AND u.deleted_at IS NULL`,
      [data.userId]
    );
    if (!rows.length) throw new Error('Intern not found.');
    await pool.query(
      `INSERT INTO point_events (user_id, action, points, awarded_by, created_at) VALUES ($1,$2,$3,$4,NOW())`,
      [data.userId, data.action, data.points, data.awardedBy]
    );
    return rows[0];
  }

  async awardBadge(badgeId: number, userId: number, awardedBy: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO badge_awards (badge_id, user_id, awarded_by, awarded_at) VALUES ($1,$2,$3,NOW()) RETURNING id`,
      [badgeId, userId, awardedBy]
    );
    return rows[0];
  }

  // ─── Cohort Analytics ────────────────────────────────────────────────────────

  async getCohortAnalytics() {
    const pool = getPool();
    const [pStats, fStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status='active')    AS active,
          COUNT(*) FILTER (WHERE status='completed') AS completed,
          COUNT(*) FILTER (WHERE status='terminated')AS terminated,
          COUNT(*) AS total
        FROM placements
      `),
      pool.query(`SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating FROM feedback`),
    ]);
    const s         = pStats.rows[0];
    const completed = Number(s.completed);
    const active    = Number(s.active);
    const terminated = Number(s.terminated);
    const done      = completed + terminated;
    return {
      completionRate:      Number(s.total) > 0 ? Math.round((completed / Number(s.total)) * 100) : 0,
      mentorSatisfaction:  fStats.rows[0].avg_rating ? Number(fStats.rows[0].avg_rating) : null,
      cohortsActive:       active,
      placementSuccess:    done > 0 ? Math.round((completed / done) * 100) : 0,
    };
  }

  // ─── Resources ───────────────────────────────────────────────────────────────

  async listResources() {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, title, type, url, owner, status, updated_at FROM resources ORDER BY updated_at DESC`
    );
    return rows.map((r) => ({
      id:      r.id,
      title:   r.title,
      type:    r.type,
      url:     r.url,
      owner:   r.owner,
      status:  r.status,
      updated: new Date(r.updated_at).toLocaleDateString(),
    }));
  }

  async createResource(data: {
    title: string; type?: string; url?: string; owner?: string; status?: string; createdBy: number;
  }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO resources (title, type, url, owner, status, created_by, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING *`,
      [data.title, data.type || 'guide', data.url || null, data.owner || null, data.status || 'draft', data.createdBy]
    );
    return rows[0];
  }

  async updateResource(id: number, data: { title?: string; type?: string; url?: string; owner?: string; status?: string }) {
    const pool = getPool();
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      if (val !== undefined) { fields.push(`${col}=$${values.length + 1}`); values.push(val); }
    };
    add('title', data.title); add('type', data.type); add('url', data.url);
    add('owner', data.owner); add('status', data.status);
    fields.push(`updated_at=NOW()`);
    if (fields.length === 1) throw new Error('No fields to update');
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE resources SET ${fields.join(', ')} WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (!rows.length) throw new Error('Resource not found.');
    return rows[0];
  }

  async deleteResource(id: number) {
    const pool = getPool();
    await pool.query(`DELETE FROM resources WHERE id=$1`, [id]);
  }

  // ─── Feedback ────────────────────────────────────────────────────────────────

  async listFeedback() {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, from_name, role, category, comment, rating, status FROM feedback ORDER BY created_at DESC`
    );
    return rows.map((r) => ({
      id:       r.id,
      from:     r.from_name,
      role:     r.role,
      category: r.category,
      comment:  r.comment,
      rating:   r.rating,
      status:   r.status,
    }));
  }

  async createFeedback(data: {
    fromName: string; role: string; category: string; comment: string; rating: number;
  }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `INSERT INTO feedback (from_name, role, category, comment, rating, status, created_at)
       VALUES ($1,$2,$3,$4,$5,'new',NOW()) RETURNING *`,
      [data.fromName, data.role, data.category, data.comment, data.rating]
    );
    return rows[0];
  }

  async updateFeedbackStatus(id: number, status: string) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE feedback SET status=$1 WHERE id=$2 RETURNING id`,
      [status, id]
    );
    if (!rows.length) throw new Error('Feedback not found.');
  }

  // ─── Platform Settings ───────────────────────────────────────────────────────

  async getSettings() {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT key, value FROM platform_settings`);
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async updateSettings(settings: Record<string, string>) {
    const pool = getPool();
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, value]
      );
    }
  }

  // ─── Audit Log ───────────────────────────────────────────────────────────────

  async logAuditEvent(adminId: number, action: string, targetType?: string, targetId?: string, metadata?: object) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_log (admin_id, action, target_type, target_id, metadata) VALUES ($1,$2,$3,$4,$5)`,
      [adminId, action, targetType ?? null, targetId ?? null, metadata ? JSON.stringify(metadata) : null]
    );
  }

  async getAuditLogEntries(limit = 50, offset = 0) {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT al.id, al.action, al.target_type, al.target_id, al.metadata,
             al.created_at, u.name AS admin_name, u.email AS admin_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.admin_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return rows;
  }

  // ─── Promote / Demote admin role ─────────────────────────────────────────────

  async promoteUser(targetUserId: number, newAdminRole: 'admin' | 'super_admin') {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE admins SET admin_role=$1 WHERE user_id=$2 RETURNING user_id`,
      [newAdminRole, targetUserId]
    );
    if (!rows.length) throw new Error('Admin record not found');
  }

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

  // ─── Email helpers ───────────────────────────────────────────────────────────

  private sendApprovalEmail(to: string, name: string, role: string, department?: string, mentor?: string) {
    const loginUrl = `${FRONTEND()}/login`;
    const body = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Congratulations <strong>${name}</strong>! Your application as a <strong>${role}</strong>
        on the Emerson Professional Development platform has been <strong style="color:#16a34a;">approved</strong>.
      </p>
      ${department ? `<p style="font-size:14px;color:#555;">📌 Department: <strong>${department}</strong></p>` : ''}
      ${mentor     ? `<p style="font-size:14px;color:#555;">👤 Assigned Mentor: <strong>${mentor}</strong></p>` : ''}
      <p style="font-size:14px;color:#555;">You can now log in and start your journey.</p>
      <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#4B1E91;border-radius:8px;">
          <a href="${loginUrl}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
            Log In Now
          </a>
        </td></tr>
      </table>
    `;
    this.sendMail(to, '🎉 Application Approved — Emerson Professional', body).catch((e) =>
      logger.error('approval email failed', e)
    );
  }

  private sendRejectionEmail(to: string, name: string, reason: string) {
    const body = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Hi <strong>${name}</strong>, thank you for applying to the Emerson Professional Development platform.
      </p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        After review, your application was <strong style="color:#dc2626;">not approved</strong> at this time.
      </p>
      ${reason ? `
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#7f1d1d;"><strong>Reason:</strong> ${reason}</p>
      </div>` : ''}
      <p style="font-size:14px;color:#555;">If you believe this is in error, please contact
        <a href="mailto:support@theemersonempire.info" style="color:#4B1E91;">support@theemersonempire.info</a>.
      </p>
    `;
    this.sendMail(to, 'Application Update — Emerson Professional', body).catch((e) =>
      logger.error('rejection email failed', e)
    );
  }

  private sendUserWelcomeEmail(to: string, name: string, password: string, role: string) {
    const ROLE_LABELS: Record<string, string> = {
      intern:  'Intern',
      company: 'Company',
      school:  'Institution',
    };
    const roleLabel = ROLE_LABELS[role] || role;
    const loginUrl  = `${FRONTEND()}/login`;
    const body = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Hi <strong>${name}</strong>, an account has been created for you on the
        Emerson Professional Development platform as a <strong>${roleLabel}</strong>.
      </p>
      <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#4B1E91;font-weight:bold;">Your login credentials</p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">📧 Email: <strong>${to}</strong></p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">🔑 Temporary Password: <strong style="font-family:monospace;font-size:15px;">${password}</strong></p>
      </div>
      <p style="font-size:14px;color:#dc2626;font-weight:bold;">
        ⚠️ Please change your password after your first login.
      </p>
      <p style="font-size:14px;color:#555;">
        If you did not expect this email, please contact
        <a href="mailto:support@theemersonempire.info" style="color:#4B1E91;">support@theemersonempire.info</a>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#4B1E91;border-radius:8px;">
          <a href="${loginUrl}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
            Log In Now
          </a>
        </td></tr>
      </table>
    `;
    this.sendMail(to, `👋 Welcome to Emerson — Your ${roleLabel} Account is Ready`, body).catch((e) =>
      logger.error('user welcome email failed', e)
    );
  }

  private sendAdminWelcomeEmail(
    to: string, name: string, password: string,
    adminType: string, department: string | null
  ) {
    const TITLES: Record<string, string> = {
      general:           'General Admin',
      mentor:            'Mentor',
      technical_support: 'Technical Support Admin',
      operations:        'Operations / Deputy Admin',
    };
    const title    = TITLES[adminType] || 'Admin';
    const loginUrl = `${FRONTEND()}/login`;
    const body = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Hi <strong>${name}</strong>, an admin account has been created for you on the
        Emerson Professional Development platform.
      </p>
      <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#4B1E91;font-weight:bold;">Your login credentials</p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">📧 Email: <strong>${to}</strong></p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">🔑 Temporary Password: <strong style="font-family:monospace;font-size:15px;">${password}</strong></p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">🏷️ Role: <strong>${title}</strong></p>
        ${department ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Department: ${department}</p>` : ''}
      </div>
      <p style="font-size:14px;color:#dc2626;font-weight:bold;">
        ⚠️ You will be asked to set a new password on your first login.
      </p>
      <p style="font-size:14px;color:#555;">
        If you did not expect this email, please contact
        <a href="mailto:support@theemersonempire.info" style="color:#4B1E91;">support@theemersonempire.info</a>.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#4B1E91;border-radius:8px;">
          <a href="${loginUrl}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
            Log In &amp; Set Password
          </a>
        </td></tr>
      </table>
    `;
    this.sendMail(to, `👋 Welcome to Emerson — Your ${title} Account is Ready`, body).catch((e) =>
      logger.error('admin welcome email failed', e)
    );
  }

  private sendMentorWelcomeEmail(to: string, name: string, password: string, department: string) {
    const loginUrl = `${FRONTEND()}/login`;
    const body = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Hi <strong>${name}</strong>, a mentor account has been created for you on the
        Emerson Professional Development platform.
      </p>
      <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:20px;margin:24px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#4B1E91;font-weight:bold;">Your login credentials</p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">📧 Email: <strong>${to}</strong></p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;">🔑 Temporary Password: <strong style="font-family:monospace;font-size:15px;">${password}</strong></p>
        <p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Department: ${department}</p>
      </div>
      <p style="font-size:14px;color:#dc2626;font-weight:bold;">
        ⚠️ You will be asked to set a new password on your first login.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#4B1E91;border-radius:8px;">
          <a href="${loginUrl}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
            Log In &amp; Set Password
          </a>
        </td></tr>
      </table>
    `;
    this.sendMail(to, '👋 Welcome to Emerson — Your Mentor Account is Ready', body).catch((e) =>
      logger.error('mentor welcome email failed', e)
    );
  }

  private async sendMail(to: string, subject: string, bodyHtml: string) {
    const html = `
      <!DOCTYPE html>
      <html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
              <tr><td style="background:#12022A;padding:20px 40px;">
                <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:bold;">Emerson Professional</h1>
              </td></tr>
              <tr><td style="padding:36px 40px;">
                ${bodyHtml}
                <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
                <p style="color:#aaa;font-size:12px;margin:0;">
                  © Emerson Professional Development Group ·
                  <a href="mailto:support@theemersonempire.info" style="color:#aaa;">support@theemersonempire.info</a>
                </p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;
    const { error } = await getResend().emails.send({ from: FROM(), to, subject, html });
    if (error) logger.error(`Resend error [${subject}]: ${JSON.stringify(error)}`);
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
      course:               r.course            || null,
      department:           r.intern_department || null,
      mentor:               r.mentor_name       || null,
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
