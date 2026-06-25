import { getPool } from '../db';

export interface OpportunityRow {
  id:              number;
  type:            'gig' | 'job';
  title:           string;
  department:      string | null;
  description:     string | null;
  requirements:    string | null;
  skills_required: string[] | null;
  compensation:    string | null;
  duration:        string | null;
  is_remote:       boolean;
  county:          string | null;
  deadline:        string | null;
  company_name:    string | null;
  industry:        string | null;
}

export interface OppApplicationRow {
  id:            number;
  opportunity_id: number;
  type:          'gig' | 'job';
  title:         string;
  company_name:  string | null;
  department:    string | null;
  compensation:  string | null;
  is_remote:     boolean;
  status:        string;
  applied_at:    string;
}

export class OpportunityService {

  // ─── List open opportunities ─────────────────────────────────────────────────

  async getOpportunities(type?: 'gig' | 'job'): Promise<OpportunityRow[]> {
    const pool = getPool();

    const { rows } = await pool.query<OpportunityRow>(`
      SELECT
        o.id,
        o.type,
        o.title,
        o.department,
        o.description,
        o.requirements,
        o.skills_required,
        o.compensation,
        o.duration,
        o.is_remote,
        o.county,
        o.deadline,
        c.company_name,
        c.industry
      FROM opportunities o
      LEFT JOIN companies c ON c.id = o.company_id
      WHERE o.status    = 'open'
        AND o.deleted_at IS NULL
        AND (o.deadline IS NULL OR o.deadline >= CURRENT_DATE)
        ${type ? `AND o.type = $1` : ''}
      ORDER BY o.created_at DESC
    `, type ? [type] : []);

    return rows;
  }

  // ─── Apply to an opportunity ─────────────────────────────────────────────────

  async apply(userId: number, opportunityId: number, coverLetter?: string): Promise<{ id: number; status: string; applied_at: string }> {
    const pool   = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get intern profile
      const profileRes = await client.query(
        'SELECT id FROM intern_profiles WHERE user_id = $1',
        [userId],
      );
      if (!profileRes.rows.length) throw new Error('Intern profile not found.');

      const internId = profileRes.rows[0].id;

      // Check opportunity exists and is open
      const oppRes = await client.query(
        `SELECT id FROM opportunities WHERE id = $1 AND status = 'open' AND deleted_at IS NULL`,
        [opportunityId],
      );
      if (!oppRes.rows.length) throw new Error('Opportunity not found or no longer open.');

      // Prevent duplicate
      const dupRes = await client.query(
        'SELECT id FROM opportunity_applications WHERE intern_id = $1 AND opportunity_id = $2',
        [internId, opportunityId],
      );
      if (dupRes.rows.length) throw new Error('You have already applied for this opportunity.');

      const appRes = await client.query(
        `INSERT INTO opportunity_applications (intern_id, opportunity_id, cover_letter, status, applied_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         RETURNING id, status, applied_at`,
        [internId, opportunityId, coverLetter ?? null],
      );

      await client.query('COMMIT');
      return appRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── My opportunity applications ─────────────────────────────────────────────

  async getMyApplications(userId: number): Promise<OppApplicationRow[]> {
    const pool = getPool();

    const { rows } = await pool.query<OppApplicationRow>(`
      SELECT
        oa.id,
        oa.opportunity_id,
        o.type,
        o.title,
        c.company_name,
        o.department,
        o.compensation,
        o.is_remote,
        oa.status,
        oa.applied_at
      FROM opportunity_applications oa
      JOIN opportunities   o  ON o.id  = oa.opportunity_id
      LEFT JOIN companies  c  ON c.id  = o.company_id
      JOIN intern_profiles ip ON ip.id = oa.intern_id
      WHERE ip.user_id = $1
      ORDER BY oa.applied_at DESC
    `, [userId]);

    return rows;
  }

  // ─── Admin: list all opportunity applications ─────────────────────────────────

  async getAllApplications(): Promise<any[]> {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        oa.id,
        oa.status,
        oa.applied_at,
        oa.cover_letter,
        o.title         AS opportunity_title,
        o.type          AS opportunity_type,
        c.company_name,
        u.name          AS intern_name,
        u.email         AS intern_email
      FROM opportunity_applications oa
      JOIN opportunities   o  ON o.id  = oa.opportunity_id
      LEFT JOIN companies  c  ON c.id  = o.company_id
      JOIN intern_profiles ip ON ip.id = oa.intern_id
      JOIN users           u  ON u.id  = ip.user_id
      WHERE u.deleted_at IS NULL
      ORDER BY oa.applied_at DESC
    `);

    return rows;
  }

  // ─── Admin: create opportunity ────────────────────────────────────────────────

  async createOpportunity(postedBy: number, data: {
    type:            'gig' | 'job';
    title:           string;
    company_id?:     number;
    department?:     string;
    description?:    string;
    requirements?:   string;
    skills_required?: string[];
    compensation?:   string;
    duration?:       string;
    is_remote?:      boolean;
    county?:         string;
    deadline?:       string;
  }): Promise<any> {
    const pool = getPool();

    const { rows } = await pool.query(
      `INSERT INTO opportunities
         (type, title, company_id, department, description, requirements,
          skills_required, compensation, duration, is_remote, county, deadline,
          status, posted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13)
       RETURNING *`,
      [
        data.type,
        data.title,
        data.company_id   ?? null,
        data.department   ?? null,
        data.description  ?? null,
        data.requirements ?? null,
        data.skills_required ? JSON.stringify(data.skills_required) : null,
        data.compensation ?? null,
        data.duration     ?? null,
        data.is_remote    ?? false,
        data.county       ?? null,
        data.deadline     ?? null,
        postedBy,
      ],
    );

    return rows[0];
  }

  // ─── Admin: update status / close ────────────────────────────────────────────

  async updateOpportunity(id: number, data: Partial<{ status: string; title: string; description: string; deadline: string }>): Promise<any> {
    const pool  = getPool();
    const sets: string[] = [];
    const vals: any[]    = [];
    let   idx  = 1;

    if (data.status      !== undefined) { sets.push(`status = $${idx++}`);      vals.push(data.status); }
    if (data.title       !== undefined) { sets.push(`title = $${idx++}`);       vals.push(data.title); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(data.description); }
    if (data.deadline    !== undefined) { sets.push(`deadline = $${idx++}`);    vals.push(data.deadline); }

    if (!sets.length) throw new Error('Nothing to update.');
    vals.push(id);

    const { rows } = await pool.query(
      `UPDATE opportunities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    if (!rows.length) throw new Error('Opportunity not found.');
    return rows[0];
  }

  // ─── Admin: update application status ────────────────────────────────────────

  async reviewApplication(appId: number, reviewerId: number, status: string): Promise<any> {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE opportunity_applications
       SET status = $1, reviewed_at = NOW(), reviewed_by = $2
       WHERE id = $3 RETURNING *`,
      [status, reviewerId, appId],
    );
    if (!rows.length) throw new Error('Application not found.');
    return rows[0];
  }
}
