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

  // ─── Onboarding flow (new) ─────────────────────────────────────────────────

  // Mentor first-name pools keyed by track category
  private static readonly FRONTEND_POOL = ['Wiltord', 'Jonathan', 'Hosea', 'Khoe'];
  private static readonly BACKEND_POOL  = ['Malik', 'Matheus', 'Joshua'];
  private static readonly FRONTEND_TRACKS = ['web design', 'social media'];

  async getOnboardingStatus(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ip.onboarding_status, ip.nda_signed, ip.disclaimer_accepted,
              ip.track, ip.track_confirmed_at, ip.mentor_name, ip.discovery_problem,
              ip.is_approved
       FROM intern_profiles ip
       WHERE ip.user_id = $1`,
      [userId],
    );
    if (!rows.length) throw new Error('Profile not found');

    const row = rows[0];

    // Self-heal: intern was approved (possibly via old code path) but status
    // was never advanced from the default — fix it now so the wizard can proceed.
    if (row.is_approved && row.onboarding_status === 'pending_approval') {
      await pool.query(
        `UPDATE intern_profiles SET onboarding_status='pending_onboarding' WHERE user_id=$1`,
        [userId],
      );
      row.onboarding_status = 'pending_onboarding';
    }

    return row;
  }

  async signAgreement(userId: number, data: {
    type:          'nda' | 'disclaimer';
    agreementText: string;
    ipAddress?:    string;
    userAgent?:    string;
  }) {
    const pool   = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO onboarding_agreements
           (intern_id, agreement_type, ip_address, user_agent, agreement_text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (intern_id, agreement_type)
         DO UPDATE SET agreed_at=NOW(), ip_address=$3, user_agent=$4, agreement_text=$5`,
        [userId, data.type, data.ipAddress ?? null, data.userAgent ?? null, data.agreementText],
      );

      const col = data.type === 'nda' ? 'nda_signed' : 'disclaimer_accepted';
      await client.query(
        `UPDATE intern_profiles SET ${col}=true WHERE user_id=$1`,
        [userId],
      );

      // Advance to track_pending once both agreements are signed
      const { rows } = await client.query(
        `SELECT nda_signed, disclaimer_accepted FROM intern_profiles WHERE user_id=$1`,
        [userId],
      );
      if (rows[0]?.nda_signed && rows[0]?.disclaimer_accepted) {
        await client.query(
          `UPDATE intern_profiles
           SET onboarding_status='track_pending'
           WHERE user_id=$1 AND onboarding_status='pending_onboarding'`,
          [userId],
        );
      }

      await client.query('COMMIT');
      return this.getOnboardingStatus(userId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async confirmTrack(userId: number, track: string) {
    const pool   = getPool();
    const client = await pool.connect();

    const poolNames = InternService.FRONTEND_TRACKS.includes(track.toLowerCase())
      ? InternService.FRONTEND_POOL
      : InternService.BACKEND_POOL;

    try {
      await client.query('BEGIN');

      // Find least-loaded mentor from the track pool
      const { rows: poolRows } = await client.query(
        `SELECT u.id, u.name, a.max_capacity,
                COUNT(ip2.mentor_id)::int AS assigned_count
         FROM users u
         JOIN admins a ON a.user_id = u.id
         LEFT JOIN intern_profiles ip2 ON ip2.mentor_id = u.id
         WHERE a.admin_type = 'mentor'
           AND split_part(u.name, ' ', 1) = ANY($1::text[])
           AND u.deleted_at IS NULL
         GROUP BY u.id, u.name, a.max_capacity
         HAVING COUNT(ip2.mentor_id) < a.max_capacity
         ORDER BY (a.max_capacity - COUNT(ip2.mentor_id)) DESC
         LIMIT 1`,
        [poolNames],
      );

      let mentorRow = poolRows[0];

      // Fall back to any available mentor if pool is full
      if (!mentorRow) {
        const { rows: fallback } = await client.query(
          `SELECT u.id, u.name, a.max_capacity,
                  COUNT(ip2.mentor_id)::int AS assigned_count
           FROM users u
           JOIN admins a ON a.user_id = u.id
           LEFT JOIN intern_profiles ip2 ON ip2.mentor_id = u.id
           WHERE a.admin_type = 'mentor' AND u.deleted_at IS NULL
           GROUP BY u.id, u.name, a.max_capacity
           HAVING COUNT(ip2.mentor_id) < a.max_capacity
           ORDER BY (a.max_capacity - COUNT(ip2.mentor_id)) DESC
           LIMIT 1`,
          [],
        );
        mentorRow = fallback[0];
      }

      const mentorId   = mentorRow?.id   ?? null;
      const mentorName = mentorRow?.name ?? null;

      await client.query(
        `UPDATE intern_profiles
         SET track=$1, track_confirmed_at=NOW(), mentor_id=$2, mentor_name=$3,
             onboarding_status='active_onboarding'
         WHERE user_id=$4 AND onboarding_status='track_pending'`,
        [track, mentorId, mentorName, userId],
      );

      await client.query('COMMIT');
      return this.getOnboardingStatus(userId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async submitDiscovery(userId: number, problem: string) {
    const pool = getPool();
    await pool.query(
      `UPDATE intern_profiles
       SET discovery_problem=$1, onboarding_status='roadmap_pending', onboarding_complete=true
       WHERE user_id=$2 AND onboarding_status='active_onboarding'`,
      [problem, userId],
    );
    return this.getOnboardingStatus(userId);
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

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async getTasks(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT t.id, t.title, t.description, t.priority, t.status,
              t.due_date, t.points, t.created_at, t.completed_at
       FROM tasks t
       JOIN placements p      ON p.id   = t.placement_id
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE ip.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.due_date ASC NULLS LAST`,
      [userId],
    );
    return rows;
  }

  async updateTaskStatus(userId: number, taskId: number, newStatus: string) {
    const pool = getPool();
    const allowed = ['in_progress', 'review', 'done'];
    if (!allowed.includes(newStatus)) throw new Error('Invalid status');

    const { rows } = await pool.query(
      `UPDATE tasks t
       SET status = $1,
           completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
       FROM placements p
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE t.placement_id = p.id
         AND ip.user_id = $2
         AND t.id = $3
         AND t.deleted_at IS NULL
       RETURNING t.*`,
      [newStatus, userId, taskId],
    );
    if (!rows.length) throw new Error('Task not found or not accessible');
    return rows[0];
  }

  // ─── Submissions ───────────────────────────────────────────────────────────

  async getSubmissions(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT s.*, t.title AS task_title
       FROM submissions s
       JOIN tasks t ON t.id = s.task_id
       WHERE s.intern_id = $1
       ORDER BY s.submitted_at DESC`,
      [userId],
    );
    return rows;
  }

  async createSubmission(userId: number, data: {
    taskId:     number;
    fileUrl:    string;
    fileName?:  string;
    fileSizeKb?: number;
    notes?:     string;
  }) {
    const pool = getPool();

    // Verify task belongs to this intern and get placement_id
    const { rows: taskRows } = await pool.query(
      `SELECT t.id, t.placement_id
       FROM tasks t
       JOIN placements p       ON p.id  = t.placement_id
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE t.id = $1 AND ip.user_id = $2 AND t.deleted_at IS NULL`,
      [data.taskId, userId],
    );
    if (!taskRows.length) throw new Error('Task not found or not accessible');
    const { placement_id } = taskRows[0];

    const { rows: [sub] } = await pool.query(
      `INSERT INTO submissions (task_id, placement_id, intern_id, file_url, file_name, file_size_kb, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
       RETURNING *`,
      [data.taskId, placement_id, userId, data.fileUrl, data.fileName ?? null, data.fileSizeKb ?? null, data.notes ?? null],
    );
    return sub;
  }

  async resubmit(userId: number, submissionId: number, data: {
    fileUrl:    string;
    fileName?:  string;
    fileSizeKb?: number;
    notes?:     string;
  }) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE submissions
       SET file_url = $1, file_name = $2, file_size_kb = $3, notes = $4,
           status = 'submitted', reviewer_comment = NULL,
           reviewed_by = NULL, reviewed_at = NULL, submitted_at = NOW()
       WHERE id = $5 AND intern_id = $6 AND status = 'rejected'
       RETURNING *`,
      [data.fileUrl, data.fileName ?? null, data.fileSizeKb ?? null, data.notes ?? null, submissionId, userId],
    );
    if (!rows.length) throw new Error('Submission not found or cannot be resubmitted');
    return rows[0];
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  async getLeaderboard(period: 'week' | 'alltime' = 'alltime') {
    const pool = getPool();
    const since = period === 'week'
      ? `AND pe.created_at >= NOW() - INTERVAL '7 days'`
      : '';

    const { rows } = await pool.query(
      `SELECT
         u.id,
         u.name,
         COALESCE(ip.department, 'General') AS department,
         COALESCE(SUM(pe.points) FILTER (WHERE 1=1 ${since}), 0)::int AS total_points,
         RANK() OVER (ORDER BY COALESCE(SUM(pe.points) FILTER (WHERE 1=1 ${since}), 0) DESC)::int AS rank
       FROM users u
       JOIN intern_profiles ip ON ip.user_id = u.id
       LEFT JOIN point_events pe ON pe.user_id = u.id
       WHERE u.role = 'intern' AND u.deleted_at IS NULL AND ip.is_approved = true
       GROUP BY u.id, u.name, ip.department
       ORDER BY total_points DESC
       LIMIT 50`,
    );
    return rows;
  }

  async getMyRank(userId: number, period: 'week' | 'alltime' = 'alltime') {
    const pool = getPool();
    const since = period === 'week' ? `AND pe.created_at >= NOW() - INTERVAL '7 days'` : '';

    // Overall rank
    const { rows: rankRows } = await pool.query(
      `SELECT rank, total_points FROM (
         SELECT
           u.id,
           COALESCE(SUM(pe.points), 0)::int AS total_points,
           RANK() OVER (ORDER BY COALESCE(SUM(pe.points), 0) DESC)::int AS rank
         FROM users u
         JOIN intern_profiles ip ON ip.user_id = u.id
         LEFT JOIN point_events pe ON pe.user_id = u.id ${since.replace('AND', 'AND')}
         WHERE u.role = 'intern' AND u.deleted_at IS NULL AND ip.is_approved = true
         GROUP BY u.id
       ) sub WHERE id = $1`,
      [userId],
    );

    // Points breakdown by action category
    const { rows: breakdown } = await pool.query(
      `SELECT
         CASE
           WHEN action ILIKE '%task%'   OR action ILIKE '%submission%' THEN 'Tasks'
           WHEN action ILIKE '%streak%' OR action ILIKE '%login%'      THEN 'Streak'
           WHEN action ILIKE '%session%' OR action ILIKE '%sync%'      THEN 'Syncs'
           ELSE 'Other'
         END AS category,
         SUM(points)::int AS points
       FROM point_events
       WHERE user_id = $1
       GROUP BY category`,
      [userId],
    );

    return {
      rank:        rankRows[0]?.rank        ?? 0,
      total_points: rankRows[0]?.total_points ?? 0,
      breakdown,
    };
  }

  // ─── Badges ───────────────────────────────────────────────────────────────

  async getBadges(userId: number) {
    const pool = getPool();
    // All badges + earned flag
    const { rows } = await pool.query(
      `SELECT b.id, b.name, b.emoji, b.description,
              ba.awarded_at,
              (ba.id IS NOT NULL) AS earned
       FROM badges b
       LEFT JOIN badge_awards ba ON ba.badge_id = b.id AND ba.user_id = $1
       ORDER BY earned DESC, b.id ASC`,
      [userId],
    );
    return rows;
  }

  // ─── Feedback ─────────────────────────────────────────────────────────────

  async submitFeedback(userId: number, data: {
    type:    'programme' | 'mentor' | 'suggestion';
    rating:  number;
    comment: string;
    name:    string;
  }) {
    const pool = getPool();
    const isAnonymous = data.type === 'suggestion';
    const { rows: [fb] } = await pool.query(
      `INSERT INTO feedback (from_name, role, category, comment, rating, user_id)
       VALUES ($1, 'intern', $2, $3, $4, $5)
       RETURNING id`,
      [
        isAnonymous ? 'Anonymous' : data.name,
        data.type,
        data.comment,
        data.rating,
        isAnonymous ? null : userId,
      ],
    );
    return fb;
  }

  async getReceivedFeedback(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT f.id, f.from_name, f.category, f.comment, f.rating, f.created_at
       FROM feedback f
       WHERE f.target_user_id = $1
       ORDER BY f.created_at DESC
       LIMIT 20`,
      [userId],
    );
    return rows;
  }

  // ─── Roadmap ──────────────────────────────────────────────────────────────

  async getRoadmap(userId: number) {
    const pool = getPool();

    // Get intern's onboarding step to determine current week
    const { rows: profileRows } = await pool.query(
      `SELECT onboarding_complete, onboarding_step FROM intern_profiles WHERE user_id = $1`,
      [userId],
    );
    const profile = profileRows[0];
    const onboardingComplete = profile?.onboarding_complete ?? false;

    // Ensure progress rows exist for this intern
    await pool.query(
      `INSERT INTO intern_roadmap_progress (intern_id, week_id, status)
       SELECT $1, rw.id,
         CASE
           WHEN rw.week_number = 1 AND $2 THEN 'current'
           WHEN rw.week_number = 1        THEN 'locked'
           ELSE 'locked'
         END
       FROM roadmap_weeks rw
       ON CONFLICT (intern_id, week_id) DO NOTHING`,
      [userId, onboardingComplete],
    );

    const { rows } = await pool.query(
      `SELECT rw.id, rw.week_number, rw.title, rw.description, rw.skills,
              irp.status, irp.completed_at
       FROM roadmap_weeks rw
       LEFT JOIN intern_roadmap_progress irp
         ON irp.week_id = rw.id AND irp.intern_id = $1
       ORDER BY rw.week_number ASC`,
      [userId],
    );

    const total     = rows.length;
    const completed = rows.filter(r => r.status === 'completed').length;
    const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
    const currentWeek = rows.find(r => r.status === 'current')?.week_number ?? 1;

    return { weeks: rows, completion_pct: pct, current_week: currentWeek, total_weeks: total };
  }

  // ─── Mentor & Sessions ────────────────────────────────────────────────────

  async getMentor(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT u.id AS mentor_id, u.name AS mentor_name, u.email AS mentor_email,
              ip_mentor.department AS mentor_department,
              ip_mentor.bio        AS mentor_bio,
              ip_mentor.skills     AS mentor_skills,
              p.id                 AS placement_id
       FROM intern_profiles ip
       JOIN placements p       ON p.intern_id = ip.id AND p.status = 'active'
       JOIN users u            ON u.id = p.mentor_id
       LEFT JOIN intern_profiles ip_mentor ON ip_mentor.user_id = u.id
       WHERE ip.user_id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async getMentorSessions(userId: number) {
    const pool = getPool();
    const now = new Date().toISOString();

    const [upcoming, past] = await Promise.all([
      pool.query(
        `SELECT ms.id, ms.scheduled_at, ms.status, ms.notes, ms.intern_rating,
                u.name AS mentor_name
         FROM mentor_sessions ms
         JOIN users u ON u.id = ms.mentor_id
         WHERE ms.intern_id = $1 AND ms.scheduled_at >= $2
         ORDER BY ms.scheduled_at ASC LIMIT 10`,
        [userId, now],
      ),
      pool.query(
        `SELECT ms.id, ms.scheduled_at, ms.status, ms.notes, ms.intern_rating,
                ms.mentor_notes, u.name AS mentor_name
         FROM mentor_sessions ms
         JOIN users u ON u.id = ms.mentor_id
         WHERE ms.intern_id = $1 AND ms.scheduled_at < $2
         ORDER BY ms.scheduled_at DESC LIMIT 20`,
        [userId, now],
      ),
    ]);
    return { upcoming: upcoming.rows, past: past.rows };
  }

  async requestMentorSession(userId: number, data: { scheduledAt: string; notes?: string }) {
    const pool = getPool();

    // Get active placement + mentor
    const { rows: pRows } = await pool.query(
      `SELECT p.id AS placement_id, p.mentor_id
       FROM intern_profiles ip
       JOIN placements p ON p.intern_id = ip.id AND p.status = 'active'
       WHERE ip.user_id = $1 LIMIT 1`,
      [userId],
    );
    if (!pRows.length) throw new Error('No active placement found');
    const { placement_id, mentor_id } = pRows[0];
    if (!mentor_id) throw new Error('No mentor assigned to your placement');

    const { rows: [session] } = await pool.query(
      `INSERT INTO mentor_sessions (placement_id, mentor_id, intern_id, scheduled_at, status, notes)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING *`,
      [placement_id, mentor_id, userId, data.scheduledAt, data.notes ?? null],
    );
    return session;
  }

  async rateMentorSession(userId: number, sessionId: number, rating: number, notes?: string) {
    const pool = getPool();
    if (rating < 1 || rating > 5) throw new Error('Rating must be 1–5');
    const { rows } = await pool.query(
      `UPDATE mentor_sessions
       SET intern_rating = $1, mentor_notes = $2
       WHERE id = $3 AND intern_id = $4
       RETURNING *`,
      [rating, notes ?? null, sessionId, userId],
    );
    if (!rows.length) throw new Error('Session not found');
    return rows[0];
  }

  // ─── Progress ─────────────────────────────────────────────────────────────

  async getProgressStats(userId: number) {
    const pool = getPool();

    // Task stats
    const { rows: taskRows } = await pool.query(
      `SELECT
         COUNT(*)::int                                                  AS total,
         COUNT(*) FILTER (WHERE t.status = 'done')::int                AS done,
         COUNT(*) FILTER (WHERE t.status = 'done'
                            AND t.completed_at <= t.due_date)::int     AS ontime,
         COALESCE(SUM(t.points) FILTER (WHERE t.status='done'), 0)::int AS points
       FROM tasks t
       JOIN placements p       ON p.id  = t.placement_id
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE ip.user_id = $1 AND t.deleted_at IS NULL`,
      [userId],
    );
    const ts = taskRows[0];
    const ontime_pct = ts.done > 0 ? Math.round((ts.ontime / ts.done) * 100) : 0;

    // Weekly task completion (last 4 weeks)
    const { rows: weeklyRows } = await pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('week', t.completed_at), 'Mon DD') AS week_label,
         COUNT(*)::int AS count
       FROM tasks t
       JOIN placements p       ON p.id  = t.placement_id
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE ip.user_id = $1
         AND t.status = 'done'
         AND t.completed_at >= NOW() - INTERVAL '4 weeks'
         AND t.deleted_at IS NULL
       GROUP BY DATE_TRUNC('week', t.completed_at)
       ORDER BY DATE_TRUNC('week', t.completed_at) ASC`,
      [userId],
    );

    // Session count + avg rating
    const { rows: sessionRows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              ROUND(AVG(intern_rating)::numeric, 1) AS avg_rating
       FROM mentor_sessions
       WHERE intern_id = $1 AND scheduled_at < NOW()`,
      [userId],
    );

    // Milestones (per placement)
    const { rows: milestoneRows } = await pool.query(
      `SELECT m.title, m.is_completed
       FROM milestones m
       JOIN placements p       ON p.id  = m.placement_id
       JOIN intern_profiles ip ON ip.id = p.intern_id
       WHERE ip.user_id = $1
       ORDER BY m.due_week ASC, m.id ASC`,
      [userId],
    );

    return {
      tasks: {
        total:     ts.total,
        done:      ts.done,
        ontime_pct,
        points:    ts.points,
      },
      weekly: weeklyRows,
      sessions: {
        total:      sessionRows[0]?.total      ?? 0,
        avg_rating: sessionRows[0]?.avg_rating ?? null,
      },
      milestones: milestoneRows,
    };
  }

  async getSkills(userId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT skill_name, proficiency FROM intern_skills WHERE intern_id = $1 ORDER BY proficiency DESC`,
      [userId],
    );
    return rows;
  }
}
