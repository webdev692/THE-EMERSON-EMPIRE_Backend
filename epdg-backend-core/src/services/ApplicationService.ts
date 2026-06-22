import { Resend } from 'resend';
import { getPool } from '../db';
import { parseCvFromUrl } from '../utils/cvParser';
import { logger } from '../utils/logger';

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  return new Resend(process.env.RESEND_API_KEY);
}
const FROM     = () => process.env.SMTP_FROM     || 'noreply@theemersonempire.info';
const FRONTEND = () => (process.env.FRONTEND_URL || 'https://epdg.netlify.app').replace(/\/$/, '');

async function sendMail(to: string | string[], subject: string, bodyHtml: string) {
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

      const result = {
        application: appResult.rows[0],
        skills_extracted: extractedSkills?.total ?? 0,
      };

      // Fire-and-forget: confirmation to intern + notification to all admins
      this.sendApplicationEmails(userId, data.slot_id).catch((e) =>
        logger.error('application email failed', e)
      );

      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async sendApplicationEmails(userId: number, slotId: number) {
    const pool = getPool();

    // Fetch intern name, email, slot title, company name
    const infoRes = await pool.query(`
      SELECT
        u.name         AS intern_name,
        u.email        AS intern_email,
        s.title        AS slot_title,
        c.company_name
      FROM users u
      JOIN intern_profiles ip ON ip.user_id = u.id
      JOIN internship_slots s  ON s.id = $2
      JOIN companies        c  ON c.id = s.company_id
      WHERE u.id = $1
    `, [userId, slotId]);

    if (!infoRes.rows.length) return;
    const { intern_name, intern_email, slot_title, company_name } = infoRes.rows[0];

    // Fetch all admin / super_admin emails
    const adminRes = await pool.query(`
      SELECT u.email, u.name
      FROM users u
      JOIN admins a ON a.user_id = u.id
      WHERE u.deleted_at IS NULL
    `);

    const dashboardUrl = `${FRONTEND()}/admin/applications`;

    // 1. Confirmation to intern
    const internBody = `
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Hi <strong>${intern_name}</strong>, we have received your application for
        <strong>${slot_title}</strong> at <strong>${company_name}</strong>.
      </p>
      <p style="font-size:15px;color:#555;line-height:1.6;">
        Our team will review your application and get back to you. You can track the status
        of your application from your dashboard.
      </p>
      <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#4B1E91;border-radius:8px;">
          <a href="${FRONTEND()}/dashboard" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
            View My Applications
          </a>
        </td></tr>
      </table>
    `;
    await sendMail(intern_email, `📩 Application Received — ${slot_title}`, internBody);

    // 2. Notification to each admin
    if (adminRes.rows.length) {
      const adminBody = `
        <p style="font-size:15px;color:#555;line-height:1.6;">
          A new internship application has been submitted.
        </p>
        <div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 6px;font-size:14px;color:#374151;">👤 Applicant: <strong>${intern_name}</strong></p>
          <p style="margin:0 0 6px;font-size:14px;color:#374151;">📌 Position: <strong>${slot_title}</strong></p>
          <p style="margin:0;font-size:14px;color:#374151;">🏢 Company: <strong>${company_name}</strong></p>
        </div>
        <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
          <tr><td style="background:#4B1E91;border-radius:8px;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">
              Review Application
            </a>
          </tr></td>
        </table>
      `;
      const adminEmails = adminRes.rows.map((r: any) => r.email);
      await sendMail(adminEmails, `🔔 New Application — ${intern_name} for ${slot_title}`, adminBody);
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
