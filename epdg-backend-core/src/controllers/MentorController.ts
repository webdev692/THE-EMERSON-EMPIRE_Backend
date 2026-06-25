import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { getPool } from '../db';

// GET /api/mentor/stats
export const getStats = async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const userId = (req as AuthRequest).user.id;
    const { rows: me } = await pool.query(
      'SELECT u.name FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1',
      [userId]
    );
    const mentorName = me[0]?.name ?? '';

    const [total, completed] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM intern_profiles ip
         JOIN users u ON u.id = ip.user_id
         WHERE ip.mentor_name = $1 AND u.deleted_at IS NULL`,
        [mentorName]
      ),
      pool.query(
        `SELECT COUNT(*) FROM intern_profiles ip
         JOIN users u ON u.id = ip.user_id
         WHERE ip.mentor_name = $1 AND ip.onboarding_complete = TRUE AND u.deleted_at IS NULL`,
        [mentorName]
      ),
    ]);

    res.json({
      success: true,
      data: {
        mentor_name:          mentorName,
        total_interns:        Number(total.rows[0].count),
        completed_onboarding: Number(completed.rows[0].count),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/mentor/interns
export const getMyInterns = async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const userId = (req as AuthRequest).user.id;
    const { rows: me } = await pool.query(
      'SELECT u.name FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1',
      [userId]
    );
    const mentorName = me[0]?.name ?? '';

    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.created_at,
         ip.id            AS profile_id,
         ip.department, ip.course, ip.cv_url,
         ip.onboarding_step, ip.onboarding_complete, ip.track,
         ip.onboarding_status, ip.discovery_problem
       FROM intern_profiles ip
       JOIN users u ON u.id = ip.user_id
       WHERE ip.mentor_name = $1 AND u.deleted_at IS NULL
       ORDER BY u.created_at DESC`,
      [mentorName]
    );

    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/mentor/interns/:userId/activate-roadmap
export const activateRoadmap = async (req: Request, res: Response) => {
  try {
    const pool       = getPool();
    const mentorId   = (req as AuthRequest).user.id;
    const internUserId = Number(req.params.userId);

    // Confirm this intern is actually assigned to this mentor
    const { rows: me } = await pool.query(
      'SELECT u.name FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1',
      [mentorId]
    );
    const mentorName = me[0]?.name ?? '';

    const { rows } = await pool.query(
      `SELECT ip.id, ip.onboarding_status
       FROM intern_profiles ip
       WHERE ip.user_id = $1 AND ip.mentor_name = $2`,
      [internUserId, mentorName]
    );

    if (!rows.length) {
      res.status(404).json({ success: false, message: 'Intern not found or not assigned to you', errors: [] });
      return;
    }

    const { onboarding_status } = rows[0];
    if (onboarding_status !== 'roadmap_pending') {
      res.status(400).json({
        success: false,
        message: `Cannot activate: intern status is "${onboarding_status}", expected "roadmap_pending"`,
        errors: [],
      });
      return;
    }

    await pool.query(
      `UPDATE intern_profiles SET onboarding_status = 'active' WHERE user_id = $1`,
      [internUserId]
    );

    res.json({ success: true, message: 'Roadmap activated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};
