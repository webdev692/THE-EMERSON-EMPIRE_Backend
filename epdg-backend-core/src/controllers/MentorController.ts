import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { getPool } from '../db';

// GET /api/mentor/stats
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { rows: me } = await pool.query(
      'SELECT u.name FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1',
      [req.user.id]
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
export const getMyInterns = async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { rows: me } = await pool.query(
      'SELECT u.name FROM admins a JOIN users u ON u.id = a.user_id WHERE a.user_id = $1',
      [req.user.id]
    );
    const mentorName = me[0]?.name ?? '';

    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.created_at,
         ip.department, ip.course, ip.cv_url,
         ip.onboarding_step, ip.onboarding_complete, ip.track
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
