import { getPool } from '../db';
import { parseCvFromUrl } from '../utils/cvParser';

export class ApplicationService {

  // ─── List open internship slots ─────────────────────────────────────────────

  async getOpenSlots() {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        s.id,
        s.title,
        s.department,
        s.description,
        s.requirements,
        s.skills_required,
        s.slots_available,
        s.slots_filled,
        s.duration_weeks,
        s.stipend,
        s.is_remote,
        s.county,
        s.deadline,
        c.company_name,
        c.industry,
        c.country
      FROM internship_slots s
      JOIN companies c ON c.id = s.company_id
      WHERE s.status = 'open'
        AND s.deleted_at IS NULL
        AND (s.deadline IS NULL OR s.deadline >= CURRENT_DATE)
        AND s.slots_filled < s.slots_available
      ORDER BY s.created_at DESC
    `);

    return rows;
  }

  // ─── Submit application ──────────────────────────────────────────────────────

  async apply(userId: number, data: { slot_id: number; cover_letter?: string }) {
    const pool   = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get intern profile
      const profileResult = await client.query(
        'SELECT id, cv_url FROM intern_profiles WHERE user_id = $1',
        [userId]
      );

      if (!profileResult.rows.length) {
        throw new Error('Intern profile not found. Complete your profile first.');
      }

      const profile = profileResult.rows[0];

      // Check slot exists and is open
      const slotResult = await client.query(
        `SELECT id, slots_available, slots_filled FROM internship_slots
         WHERE id = $1 AND status = 'open' AND deleted_at IS NULL`,
        [data.slot_id]
      );

      if (!slotResult.rows.length) {
        throw new Error('Internship slot not found or no longer open.');
      }

      const slot = slotResult.rows[0];

      if (slot.slots_filled >= slot.slots_available) {
        throw new Error('This internship slot is already full.');
      }

      // Check no duplicate application
      const existing = await client.query(
        'SELECT id FROM applications WHERE intern_id = $1 AND slot_id = $2',
        [profile.id, data.slot_id]
      );

      if (existing.rows.length) {
        throw new Error('You have already applied for this slot.');
      }

      // Extract skills from CV if available
      let extractedSkills = null;
      let cvTextSnapshot = null;

      if (profile.cv_url) {
        const parsed = await parseCvFromUrl(profile.cv_url);
        if (parsed) {
          extractedSkills = parsed.skills;
          cvTextSnapshot  = parsed.text.slice(0, 5000);
        }
      }

      // Insert application
      const appResult = await client.query(
        `INSERT INTO applications (intern_id, slot_id, cover_letter, extracted_skills, cv_text_snapshot, status, applied_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
         RETURNING id, status, applied_at`,
        [profile.id, data.slot_id, data.cover_letter || null,
         extractedSkills ? JSON.stringify(extractedSkills) : null,
         cvTextSnapshot]
      );

      await client.query('COMMIT');

      return {
        application: appResult.rows[0],
        skills_extracted: extractedSkills?.total ?? 0,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Get my applications ─────────────────────────────────────────────────────

  async getMyApplications(userId: number) {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        a.id,
        a.status,
        a.applied_at,
        a.cover_letter,
        a.extracted_skills,
        a.company_notes,
        s.title         AS slot_title,
        s.department,
        s.duration_weeks,
        s.stipend,
        s.is_remote,
        c.company_name,
        c.industry
      FROM applications a
      JOIN internship_slots s ON s.id = a.slot_id
      JOIN companies        c ON c.id = s.company_id
      JOIN intern_profiles  ip ON ip.id = a.intern_id
      WHERE ip.user_id = $1
      ORDER BY a.applied_at DESC
    `, [userId]);

    return rows;
  }

  // ─── Admin: get all applications with extracted skills ───────────────────────

  async getAllApplications(filters: { status?: string; slot_id?: number }) {
    const pool = getPool();

    const { rows } = await pool.query(`
      SELECT
        a.id,
        a.status,
        a.applied_at,
        a.cover_letter,
        a.extracted_skills,
        a.company_notes,
        u.name          AS intern_name,
        u.email         AS intern_email,
        ip.course,
        ip.cv_url,
        ip.bio,
        s.title         AS slot_title,
        s.department    AS slot_department,
        c.company_name
      FROM applications a
      JOIN intern_profiles  ip ON ip.id    = a.intern_id
      JOIN users            u  ON u.id     = ip.user_id
      JOIN internship_slots s  ON s.id     = a.slot_id
      JOIN companies        c  ON c.id     = s.company_id
      WHERE u.deleted_at IS NULL
      ORDER BY a.applied_at DESC
    `);

    let results = rows;
    if (filters.status)  results = results.filter((r) => r.status  === filters.status);
    if (filters.slot_id) results = results.filter((r) => r.slot_id === filters.slot_id);

    return results;
  }
}
