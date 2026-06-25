import { getPool } from '../db';

const LEVEL_ORDER: Record<string, number> = {
  beginner:     0,
  intermediate: 1,
  advanced:     2,
};

const NEXT_LEVEL: Record<string, string | null> = {
  beginner:     'intermediate',
  intermediate: 'advanced',
  advanced:     null,
};

export class RoadmapService {

  private async getInternProfileId(userId: number): Promise<number> {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id FROM intern_profiles WHERE user_id = $1',
      [userId],
    );
    if (!rows.length) throw new Error('Intern profile not found');
    return rows[0].id;
  }

  // ── Intern methods ────────────────────────────────────────────────────────

  async getRoadmap(userId: number) {
    const pool     = getPool();
    const internId = await this.getInternProfileId(userId);

    const { rows: profileRows } = await pool.query(
      'SELECT track, onboarding_status FROM intern_profiles WHERE id = $1',
      [internId],
    );
    const trackRaw: string | null     = profileRows[0]?.track             ?? null;
    const onboardingStatus: string    = profileRows[0]?.onboarding_status ?? '';

    // Roadmap is only accessible once a mentor has activated it
    if (onboardingStatus !== 'active') {
      return {
        pending_activation: true,
        onboarding_status:  onboardingStatus,
        track: null,
        levels: [],
      };
    }

    if (!trackRaw) return { track: null, levels: [] };

    const slug = trackRaw.toLowerCase().replace(/\s+/g, '-');

    const { rows: trackRows } = await pool.query(
      'SELECT id, slug, name, description FROM tracks WHERE slug = $1',
      [slug],
    );
    if (!trackRows.length) return { track: trackRaw, levels: [], message: 'Track configuration not found' };
    const trackRecord = trackRows[0];

    // Auto-enroll in level progress
    await pool.query(
      `INSERT INTO intern_level_progress (intern_id, track_id, current_level)
       VALUES ($1, $2, 'beginner')
       ON CONFLICT (intern_id, track_id) DO NOTHING`,
      [internId, trackRecord.id],
    );

    const { rows: progressRows } = await pool.query(
      `SELECT current_level, level_started_at, level_up_requested_at
       FROM intern_level_progress
       WHERE intern_id = $1 AND track_id = $2`,
      [internId, trackRecord.id],
    );
    const progress = progressRows[0];

    const { rows: modules } = await pool.query(
      `SELECT id, level, order_index, title, objective, artifact
       FROM roadmap_modules
       WHERE track_id = $1
       ORDER BY
         CASE level WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END,
         order_index ASC`,
      [trackRecord.id],
    );

    const { rows: completions } = await pool.query(
      `SELECT module_id, completed_at, mentor_signed, mentor_signed_at, artifact_url, notes
       FROM module_completions
       WHERE intern_id = $1`,
      [internId],
    );
    const completionMap = new Map(completions.map(c => [c.module_id, c]));

    const currentLevelOrder = LEVEL_ORDER[progress.current_level] ?? 0;

    const levels = ['beginner', 'intermediate', 'advanced'].map(lvl => {
      const lvlOrder  = LEVEL_ORDER[lvl];
      const lvlMods   = modules.filter(m => m.level === lvl);
      const doneCount = lvlMods.filter(m => completionMap.has(m.id)).length;
      const allDone   = lvlMods.length > 0 && doneCount === lvlMods.length;

      return {
        level:             lvl,
        status:            lvlOrder < currentLevelOrder ? 'completed'
                         : lvlOrder === currentLevelOrder ? 'current'
                         : 'locked',
        modules_total:     lvlMods.length,
        modules_completed: doneCount,
        all_complete:      allDone,
        modules: lvlMods.map((m, idx) => {
          const completion = completionMap.get(m.id) ?? null;
          const prevMod    = idx > 0 ? lvlMods[idx - 1] : null;
          const prevDone   = prevMod ? completionMap.has(prevMod.id) : true;

          let status: string;
          if (completion) {
            status = completion.mentor_signed ? 'signed' : 'completed';
          } else if (lvlOrder < currentLevelOrder) {
            status = 'completed'; // level already passed
          } else if (lvlOrder > currentLevelOrder) {
            status = 'locked';
          } else {
            status = prevDone ? 'available' : 'locked';
          }

          return {
            id:               m.id,
            order_index:      m.order_index,
            title:            m.title,
            objective:        m.objective,
            artifact:         m.artifact,
            status,
            completed_at:     completion?.completed_at     ?? null,
            artifact_url:     completion?.artifact_url     ?? null,
            mentor_signed:    completion?.mentor_signed    ?? false,
            mentor_signed_at: completion?.mentor_signed_at ?? null,
          };
        }),
      };
    });

    return {
      track: {
        id:          trackRecord.id,
        slug:        trackRecord.slug,
        name:        trackRecord.name,
        description: trackRecord.description,
      },
      current_level:          progress.current_level,
      level_started_at:       progress.level_started_at,
      level_up_requested_at:  progress.level_up_requested_at ?? null,
      levels,
    };
  }

  async completeModule(userId: number, moduleId: number, artifactUrl?: string) {
    const pool     = getPool();
    const internId = await this.getInternProfileId(userId);

    const { rows: modRows } = await pool.query(
      `SELECT rm.id, rm.track_id, rm.level, rm.order_index
       FROM roadmap_modules rm
       WHERE rm.id = $1`,
      [moduleId],
    );
    if (!modRows.length) throw new Error('Module not found');
    const mod = modRows[0];

    const { rows: progressRows } = await pool.query(
      `SELECT current_level FROM intern_level_progress
       WHERE intern_id = $1 AND track_id = $2`,
      [internId, mod.track_id],
    );
    if (!progressRows.length) throw new Error('You are not enrolled in this track');
    const { current_level } = progressRows[0];

    if (mod.level !== current_level) {
      throw new Error(
        `This module is in the ${mod.level} level. You are currently at ${current_level}.`
      );
    }

    // Sequential: previous order_index must be complete
    if (mod.order_index > 1) {
      const { rows: prevRows } = await pool.query(
        `SELECT mc.id
         FROM roadmap_modules rm
         LEFT JOIN module_completions mc
           ON mc.module_id = rm.id AND mc.intern_id = $1
         WHERE rm.track_id = $2 AND rm.level = $3 AND rm.order_index = $4`,
        [internId, mod.track_id, mod.level, mod.order_index - 1],
      );
      if (!prevRows.length || !prevRows[0].id) {
        throw new Error('Complete the previous module first');
      }
    }

    const { rows: [completion] } = await pool.query(
      `INSERT INTO module_completions (intern_id, module_id, artifact_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (intern_id, module_id)
       DO UPDATE SET artifact_url = EXCLUDED.artifact_url, completed_at = NOW()
       RETURNING *`,
      [internId, moduleId, artifactUrl ?? null],
    );
    return completion;
  }

  async requestLevelUp(userId: number, trackId: number) {
    const pool     = getPool();
    const internId = await this.getInternProfileId(userId);

    const { rows: progressRows } = await pool.query(
      `SELECT current_level, level_up_requested_at
       FROM intern_level_progress
       WHERE intern_id = $1 AND track_id = $2`,
      [internId, trackId],
    );
    if (!progressRows.length) throw new Error('You are not enrolled in this track');
    const { current_level, level_up_requested_at } = progressRows[0];

    if (!NEXT_LEVEL[current_level]) throw new Error('You have already reached the highest level');
    if (level_up_requested_at)      throw new Error('A level-up request is already pending');

    const { rows: incomplete } = await pool.query(
      `SELECT rm.id
       FROM roadmap_modules rm
       LEFT JOIN module_completions mc
         ON mc.module_id = rm.id AND mc.intern_id = $1
       WHERE rm.track_id = $2 AND rm.level = $3 AND mc.id IS NULL`,
      [internId, trackId, current_level],
    );
    if (incomplete.length > 0) {
      throw new Error(
        `Complete all ${current_level} modules before requesting a level-up (${incomplete.length} remaining)`
      );
    }

    await pool.query(
      `UPDATE intern_level_progress
       SET level_up_requested_at = NOW()
       WHERE intern_id = $1 AND track_id = $2`,
      [internId, trackId],
    );

    return { requested: true, current_level, next_level: NEXT_LEVEL[current_level] };
  }

  // ── Admin / Mentor methods ────────────────────────────────────────────────

  async mentorSignOffModule(internProfileId: number, moduleId: number, mentorUserId: number) {
    const pool = getPool();
    const { rows } = await pool.query(
      `UPDATE module_completions
       SET mentor_signed = true, mentor_id = $1, mentor_signed_at = NOW()
       WHERE intern_id = $2 AND module_id = $3
       RETURNING *`,
      [mentorUserId, internProfileId, moduleId],
    );
    if (!rows.length) throw new Error('Completion record not found — intern has not completed this module');
    return rows[0];
  }

  async approveLevelUp(internProfileId: number, trackId: number, mentorUserId: number) {
    const pool = getPool();

    const { rows: progressRows } = await pool.query(
      `SELECT current_level, level_up_requested_at
       FROM intern_level_progress
       WHERE intern_id = $1 AND track_id = $2`,
      [internProfileId, trackId],
    );
    if (!progressRows.length) throw new Error('Intern not enrolled in this track');
    const { current_level, level_up_requested_at } = progressRows[0];

    if (!level_up_requested_at) throw new Error('No level-up request is pending for this intern');
    const next = NEXT_LEVEL[current_level];
    if (!next) throw new Error('Intern is already at the highest level');

    await pool.query(
      `UPDATE intern_level_progress
       SET current_level = $1, level_started_at = NOW(), level_up_requested_at = NULL
       WHERE intern_id = $2 AND track_id = $3`,
      [next, internProfileId, trackId],
    );

    return { approved: true, previous_level: current_level, new_level: next, approved_by: mentorUserId };
  }

  async getPendingLevelUps() {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT
         ilp.id, ilp.intern_id, ilp.track_id,
         ilp.current_level, ilp.level_up_requested_at,
         u.name  AS intern_name,
         u.email AS intern_email,
         t.name  AS track_name,
         t.slug  AS track_slug
       FROM intern_level_progress ilp
       JOIN intern_profiles ip ON ip.id  = ilp.intern_id
       JOIN users u             ON u.id  = ip.user_id
       JOIN tracks t            ON t.id  = ilp.track_id
       WHERE ilp.level_up_requested_at IS NOT NULL
       ORDER BY ilp.level_up_requested_at ASC`,
    );
    return rows;
  }
}
