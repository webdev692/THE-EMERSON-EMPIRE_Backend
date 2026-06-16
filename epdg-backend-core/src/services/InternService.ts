import { getPool } from '../db';

// Ordered list of onboarding steps — source of truth
const ONBOARDING_STEPS = [
  { id: 1, title: 'Profile Setup',          description: 'Complete your profile: name, bio, course, skills and contact info.' },
  { id: 2, title: 'Email Verification',     description: 'Verify your email address to secure your account.' },
  { id: 3, title: 'Track Selection',        description: 'Select your internship track: Web Design, Sales, Social Media or Digital Marketing.' },
  { id: 4, title: 'Workspace Setup',        description: 'Set up your work environment and acknowledge the NDA and disclaimer.' },
  { id: 5, title: 'First Task Submission',  description: 'Submit your first portfolio task to show you are ready.' },
  { id: 6, title: 'Onboarding Sign-off',    description: 'Your mentor reviews your progress and signs you off to begin the full internship.' },
];

export class InternService {

  // ─── Onboarding ────────────────────────────────────────────────────────────

  async getOnboardingSteps(userId: number) {
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT ip.onboarding_step, ip.onboarding_complete, u.is_verified
       FROM intern_profiles ip
       JOIN users u ON u.id = ip.user_id
       WHERE ip.user_id = $1`,
      [userId]
    );

    if (!rows.length) {
      throw new Error('Intern profile not found');
    }

    const { onboarding_step, onboarding_complete, is_verified } = rows[0];
    const current = onboarding_complete ? ONBOARDING_STEPS.length + 1 : Number(onboarding_step);

    return ONBOARDING_STEPS.map((step) => ({
      ...step,
      status:
        step.id < current ? 'completed' :
        step.id === current && !is_verified && step.id === 2 ? 'current' :
        step.id === current ? 'current' :
        'locked',
    }));
  }

  async completeOnboardingStep(userId: number, stepId: number) {
    const pool = getPool();

    const { rows } = await pool.query(
      'SELECT onboarding_step, onboarding_complete FROM intern_profiles WHERE user_id = $1',
      [userId]
    );

    if (!rows.length) throw new Error('Intern profile not found');

    const current = Number(rows[0].onboarding_step);

    if (stepId !== current) {
      throw new Error(`Step ${stepId} is not the current step.`);
    }

    const nextStep  = current + 1;
    const allDone   = nextStep > ONBOARDING_STEPS.length;

    await pool.query(
      `UPDATE intern_profiles
       SET onboarding_step = $1, onboarding_complete = $2
       WHERE user_id = $3`,
      [allDone ? current : nextStep, allDone, userId]
    );

    return this.getOnboardingSteps(userId);
  }

  // ─── Profile ───────────────────────────────────────────────────────────────

  async getProfile(userId: number) {
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.role, u.is_verified, u.created_at, u.last_login_at,
         ip.id          AS profile_id,
         ip.course,
         ip.year_of_study,
         ip.bio,
         ip.skills,
         ip.cv_url,
         ip.contact_phone,
         ip.department,
         ip.mentor_name,
         ip.track,
         ip.onboarding_step,
         ip.onboarding_complete,
         ip.nda_signed,
         ip.disclaimer_accepted,
         ip.profile_photo,
         ip.linkedin_url,
         ip.github_url,
         ip.portfolio_url,
         ip.country,
         ip.city,
         ip.is_approved,
         ip.rejection_reason
       FROM users u
       JOIN intern_profiles ip ON ip.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );

    if (!rows.length) throw new Error('Profile not found');
    return rows[0];
  }

  async updateProfile(userId: number, data: {
    name?:         string;
    bio?:          string;
    course?:       string;
    year_of_study?: number;
    contact_phone?: string;
    skills?:       string[];
    track?:        string;
    cv_url?:       string;
    linkedin_url?: string;
    github_url?:   string;
    portfolio_url?: string;
    country?:      string;
    city?:         string;
    nda_signed?:   boolean;
    disclaimer_accepted?: boolean;
  }) {
    const pool   = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      if (data.name) {
        await client.query(
          'UPDATE users SET name = $1 WHERE id = $2',
          [data.name, userId]
        );
      }

      const profileFields: string[] = [];
      const profileValues: unknown[] = [];
      let idx = 1;

      const map: Record<string, unknown> = {
        bio:                  data.bio,
        course:               data.course,
        year_of_study:        data.year_of_study,
        contact_phone:        data.contact_phone,
        skills:               data.skills ? JSON.stringify(data.skills) : undefined,
        track:                data.track,
        cv_url:               data.cv_url,
        linkedin_url:         data.linkedin_url,
        github_url:           data.github_url,
        portfolio_url:        data.portfolio_url,
        country:              data.country,
        city:                 data.city,
        nda_signed:           data.nda_signed,
        disclaimer_accepted:  data.disclaimer_accepted,
      };

      for (const [key, val] of Object.entries(map)) {
        if (val !== undefined) {
          profileFields.push(`${key} = $${idx++}`);
          profileValues.push(val);
        }
      }

      if (profileFields.length) {
        profileValues.push(userId);
        await client.query(
          `UPDATE intern_profiles SET ${profileFields.join(', ')} WHERE user_id = $${idx}`,
          profileValues
        );
      }

      await client.query('COMMIT');
      return this.getProfile(userId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(userId: number) {
    const pool = getPool();

    // Profile + placement info
    const profileResult = await pool.query(
      `SELECT
         u.name, ip.department, ip.mentor_name, ip.track, ip.onboarding_complete,
         ip.is_approved,
         EXTRACT(YEAR FROM u.created_at)::int AS cohort_year,
         p.id AS placement_id, p.status AS placement_status,
         p.start_date, p.end_date
       FROM users u
       JOIN intern_profiles ip ON ip.user_id = u.id
       LEFT JOIN intern_profiles ip2 ON ip2.user_id = u.id
       LEFT JOIN placements p ON p.intern_id = ip.id AND p.status = 'active'
       WHERE u.id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );

    const profile = profileResult.rows[0] ?? {};

    // Tasks
    let tasks: any[] = [];
    let taskStats = { done: 0, total: 0, points: 0, ontime_pct: 0 };

    if (profile.placement_id) {
      const taskResult = await pool.query(
        `SELECT id, title, status, due_date, points, priority
         FROM tasks
         WHERE placement_id = $1 AND deleted_at IS NULL
         ORDER BY due_date ASC NULLS LAST
         LIMIT 10`,
        [profile.placement_id]
      );
      tasks = taskResult.rows;

      const statsResult = await pool.query(
        `SELECT
           COUNT(*)                                         AS total,
           COUNT(*) FILTER (WHERE status = 'done')         AS done,
           COALESCE(SUM(points) FILTER (WHERE status='done'), 0) AS points
         FROM tasks
         WHERE placement_id = $1 AND deleted_at IS NULL`,
        [profile.placement_id]
      );
      const s = statsResult.rows[0];
      const done  = Number(s.done);
      const total = Number(s.total);
      taskStats = {
        done,
        total,
        points:     Number(s.points),
        ontime_pct: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }

    // Days remaining
    let days_remaining = 0;
    if (profile.end_date) {
      days_remaining = Math.max(
        0,
        Math.ceil((new Date(profile.end_date).getTime() - Date.now()) / 86400000)
      );
    }

    // Announcements
    const annResult = await pool.query(
      `SELECT id, title, body, created_at
       FROM announcements
       WHERE audience IN ('all', 'intern') AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`
    );

    return {
      profile: {
        name:               profile.name,
        department:         profile.department     ?? 'Not assigned',
        mentor:             profile.mentor_name    ?? 'Not assigned',
        track:              profile.track          ?? 'Not selected',
        cohort_year:        profile.cohort_year    ?? new Date().getFullYear(),
        onboarding_complete: profile.onboarding_complete ?? false,
        is_approved:        profile.is_approved    ?? false,
        placement_status:   profile.placement_status ?? null,
      },
      stats: taskStats,
      days_remaining,
      tasks,
      announcements: annResult.rows,
    };
  }
}
