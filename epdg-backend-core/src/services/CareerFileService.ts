import { getPool } from '../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string, id: number): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '') + '-' + id;
}

function scoreTier(score: number): string {
  if (score >= 90) return 'employer_ready';
  if (score >= 75) return 'internship_ready_plus';
  if (score >= 50) return 'internship_ready';
  if (score >= 25) return 'developing';
  return 'not_ready';
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CareerFileService {

  private async getProfileId(userId: number): Promise<number> {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT ip.id
       FROM intern_profiles ip
       JOIN users u ON u.id = ip.user_id
       WHERE ip.user_id = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [userId],
    );
    if (!rows[0]) throw new Error('Intern profile not found');
    return rows[0].id;
  }

  async getOrCreate(userId: number) {
    const pool = getPool();
    const profileId = await this.getProfileId(userId);

    const existing = await pool.query(
      `SELECT * FROM career_files WHERE intern_profile_id = $1`,
      [profileId],
    );
    if (existing.rows[0]) return existing.rows[0];

    const nameRes = await pool.query(
      `SELECT u.name FROM intern_profiles ip JOIN users u ON u.id = ip.user_id WHERE ip.id = $1`,
      [profileId],
    );
    const slug = slugify(nameRes.rows[0]?.name ?? 'intern', profileId);

    const { rows } = await pool.query(
      `INSERT INTO career_files (intern_profile_id, slug)
       VALUES ($1, $2)
       ON CONFLICT (intern_profile_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [profileId, slug],
    );
    return rows[0];
  }

  async getCareerFile(userId: number) {
    const pool = getPool();
    const profileId = await this.getProfileId(userId);
    const cf = await this.getOrCreate(userId);

    const [skills, projects, experiences, history, profile] = await Promise.all([
      pool.query(
        `SELECT * FROM career_skills WHERE career_file_id = $1
         ORDER BY
           CASE source
             WHEN 'mentor_endorsed'   THEN 1
             WHEN 'platform_activity' THEN 2
             WHEN 'extracted_cv'      THEN 3
             ELSE 4
           END, skill_name ASC`,
        [cf.id],
      ),
      pool.query(
        `SELECT * FROM career_projects WHERE career_file_id = $1
         ORDER BY mentor_signed DESC, verified DESC, created_at DESC`,
        [cf.id],
      ),
      pool.query(
        `SELECT * FROM career_experiences WHERE career_file_id = $1
         ORDER BY is_current DESC, start_date DESC NULLS LAST`,
        [cf.id],
      ),
      pool.query(
        `SELECT score, tier, breakdown, snapshot_at
         FROM readiness_score_history
         WHERE career_file_id = $1
         ORDER BY snapshot_at DESC LIMIT 30`,
        [cf.id],
      ),
      pool.query(
        `SELECT ip.track, ip.department, ip.course, ip.github_url, ip.linkedin_url,
                ip.portfolio_url, ip.onboarding_status,
                u.name, u.email
         FROM intern_profiles ip JOIN users u ON u.id = ip.user_id
         WHERE ip.id = $1`,
        [profileId],
      ),
    ]);

    return {
      ...cf,
      profile: profile.rows[0] ?? null,
      skills: skills.rows,
      projects: projects.rows,
      experiences: experiences.rows,
      score_history: history.rows,
    };
  }

  async updateCareerFile(userId: number, data: {
    headline?: string;
    summary?: string;
    is_public?: boolean;
  }) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    const { rows } = await pool.query(
      `UPDATE career_files
       SET headline  = COALESCE($1, headline),
           summary   = COALESCE($2, summary),
           is_public = COALESCE($3, is_public),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [data.headline ?? null, data.summary ?? null, data.is_public ?? null, cf.id],
    );
    return rows[0];
  }

  // ── Auto-populate from platform activity (point 1) ────────────────────────

  async autoPopulate(userId: number) {
    const pool = getPool();
    const profileId = await this.getProfileId(userId);
    const cf = await this.getOrCreate(userId);

    // 1. Module completions → career_projects (verified = true, mentor_signed from mc)
    const { rows: completions } = await pool.query(
      `SELECT mc.id, mc.artifact_url, mc.mentor_signed, mc.completed_at,
              rm.title, rm.objective, rm.level,
              t.name AS track_name
       FROM module_completions mc
       JOIN roadmap_modules rm ON rm.id = mc.module_id
       JOIN tracks t            ON t.id  = rm.track_id
       WHERE mc.intern_id = $1`,
      [profileId],  // module_completions.intern_id → intern_profiles(id)
    );

    for (const c of completions) {
      await pool.query(
        `INSERT INTO career_projects
           (career_file_id, title, description, url, source, source_ref_id, verified, mentor_signed)
         VALUES ($1, $2, $3, $4, 'module_completion', $5, true, $6)
         ON CONFLICT (career_file_id, source, source_ref_id) DO UPDATE
           SET mentor_signed = EXCLUDED.mentor_signed,
               url = COALESCE(EXCLUDED.url, career_projects.url)`,
        [
          cf.id,
          c.title,
          `${c.objective} [${c.track_name} · ${c.level}]`,
          c.artifact_url ?? null,
          c.id,
          c.mentor_signed,
        ],
      );
    }

    // 2. intern_skills → career_skills (source: platform_activity)
    // intern_skills.intern_id references users(id)
    const { rows: platformSkills } = await pool.query(
      `SELECT skill_name, proficiency FROM intern_skills WHERE intern_id = $1`,
      [userId],
    );

    for (const s of platformSkills) {
      const prof: string = s.proficiency >= 70 ? 'advanced'
                         : s.proficiency >= 40 ? 'intermediate'
                         : 'beginner';
      await pool.query(
        `INSERT INTO career_skills (career_file_id, skill_name, source, proficiency)
         VALUES ($1, $2, 'platform_activity', $3)
         ON CONFLICT (career_file_id, skill_name) DO UPDATE
           SET proficiency = EXCLUDED.proficiency,
               source = CASE
                 WHEN career_skills.source = 'self_reported' THEN 'platform_activity'
                 ELSE career_skills.source
               END`,
        [cf.id, s.skill_name, prof],
      );
    }

    // 3. CV-extracted skills from intern_profiles.skills JSONB → career_skills
    const { rows: profileRow } = await pool.query(
      `SELECT skills FROM intern_profiles WHERE id = $1`,
      [profileId],
    );
    const extractedSkills: string[] = profileRow[0]?.skills ?? [];
    for (const skillName of extractedSkills) {
      if (!skillName || typeof skillName !== 'string') continue;
      await pool.query(
        `INSERT INTO career_skills (career_file_id, skill_name, source, proficiency)
         VALUES ($1, $2, 'extracted_cv', 'beginner')
         ON CONFLICT (career_file_id, skill_name) DO NOTHING`,
        [cf.id, skillName.trim()],
      );
    }

    await pool.query(
      `UPDATE career_files SET last_auto_populated_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [cf.id],
    );

    await this.calculateAndSaveScore(userId);
    return this.getCareerFile(userId);
  }

  // ── Readiness score (points 2 + 6) ───────────────────────────────────────

  async calculateAndSaveScore(userId: number) {
    const pool = getPool();
    const profileId = await this.getProfileId(userId);
    const cf = await this.getOrCreate(userId);

    const [cfData, skillsRes, projectsRes, levelRes, profileRes, expRes] = await Promise.all([
      pool.query(`SELECT headline, summary FROM career_files WHERE id = $1`, [cf.id]),
      pool.query(`SELECT source, proficiency FROM career_skills WHERE career_file_id = $1`, [cf.id]),
      pool.query(`SELECT verified, mentor_signed, source FROM career_projects WHERE career_file_id = $1`, [cf.id]),
      pool.query(
        `SELECT current_level FROM intern_level_progress WHERE intern_id = $1 LIMIT 1`,
        [profileId],
      ),
      pool.query(
        `SELECT ip.github_url, ip.linkedin_url FROM intern_profiles ip WHERE ip.id = $1`,
        [profileId],
      ),
      pool.query(`SELECT COUNT(*)::int AS cnt FROM career_experiences WHERE career_file_id = $1`, [cf.id]),
    ]);

    const { headline, summary } = cfData.rows[0] ?? {};
    const skills   = skillsRes.rows;
    const projects = projectsRes.rows;
    const level    = levelRes.rows[0]?.current_level ?? null;
    const { github_url, linkedin_url } = profileRes.rows[0] ?? {};
    const expCount = expRes.rows[0]?.cnt ?? 0;

    // Profile completeness (10 pts)
    let profileScore = 0;
    if (headline)                   profileScore += 3;
    if (summary && summary.length > 50) profileScore += 3;
    if (github_url)                 profileScore += 2;
    if (linkedin_url)               profileScore += 2;

    // Roadmap level (20 pts)
    let roadmapScore = 0;
    if (level === 'intermediate') roadmapScore = 10;
    else if (level === 'advanced') roadmapScore = 20;

    // Mentor-signed module completions (20 pts, 4 pts each, cap 5)
    const signedCount  = projects.filter(p => p.mentor_signed).length;
    const projectScore = Math.min(signedCount * 4, 20);

    // Platform skills (15 pts, 3 pts each, cap 5)
    const platformCount     = skills.filter(s => s.source === 'platform_activity').length;
    const platformSkillScore = Math.min(platformCount * 3, 15);

    // Mentor-endorsed skills (20 pts, 5 pts each, cap 4)
    const endorsedCount = skills.filter(s => s.source === 'mentor_endorsed').length;
    const endorsedScore = Math.min(endorsedCount * 5, 20);

    // Self-reported additions (15 pts)
    const manualProjects  = projects.filter(p => p.source === 'manual').length;
    const selfSkills      = skills.filter(s => s.source === 'self_reported').length;
    const selfScore = Math.min(manualProjects * 2, 6)
                    + Math.min(selfSkills, 5)
                    + Math.min(expCount * 2, 4);

    const total = profileScore + roadmapScore + projectScore + platformSkillScore + endorsedScore + selfScore;
    const score = Math.min(total, 100);
    const tier  = scoreTier(score);

    const breakdown = {
      profile:          profileScore,
      roadmap:          roadmapScore,
      verified_projects: projectScore,
      platform_skills:  platformSkillScore,
      endorsed_skills:  endorsedScore,
      self_reported:    selfScore,
    };

    // Save snapshot only when score changed by ≥ 2 or first ever
    const { rows: last } = await pool.query(
      `SELECT score FROM readiness_score_history WHERE career_file_id = $1
       ORDER BY snapshot_at DESC LIMIT 1`,
      [cf.id],
    );
    if (!last[0] || Math.abs(last[0].score - score) >= 2) {
      await pool.query(
        `INSERT INTO readiness_score_history (career_file_id, score, tier, breakdown)
         VALUES ($1, $2, $3, $4)`,
        [cf.id, score, tier, JSON.stringify(breakdown)],
      );
    }

    await pool.query(
      `UPDATE career_files SET readiness_score = $1, readiness_tier = $2, updated_at = NOW()
       WHERE id = $3`,
      [score, tier, cf.id],
    );

    return { score, tier, breakdown };
  }

  // ── Skills (point 2 — verified vs claimed) ───────────────────────────────

  async addSkill(userId: number, data: { skill_name: string; category?: string; proficiency?: string }) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    const { rows } = await pool.query(
      `INSERT INTO career_skills (career_file_id, skill_name, category, source, proficiency)
       VALUES ($1, $2, $3, 'self_reported', $4)
       ON CONFLICT (career_file_id, skill_name) DO UPDATE
         SET category   = COALESCE(EXCLUDED.category, career_skills.category),
             proficiency = EXCLUDED.proficiency
       RETURNING *`,
      [cf.id, data.skill_name.trim(), data.category ?? null, data.proficiency ?? 'beginner'],
    );
    return rows[0];
  }

  async removeSkill(userId: number, skillId: number) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    await pool.query(
      `DELETE FROM career_skills WHERE id = $1 AND career_file_id = $2`,
      [skillId, cf.id],
    );
  }

  // Mentor endorses a skill (point 2 + point 8 gate)
  async endorseSkill(mentorUserId: number, internProfileId: number, skillId: number) {
    const pool = getPool();

    const { rows: check } = await pool.query(
      `SELECT ip.id FROM intern_profiles ip
       JOIN users u ON u.id = ip.mentor_id
       WHERE ip.id = $1 AND ip.mentor_id = $2 AND u.deleted_at IS NULL`,
      [internProfileId, mentorUserId],
    );
    if (!check[0]) throw new Error('Not authorized to endorse this intern');

    const { rows: cfRows } = await pool.query(
      `SELECT id FROM career_files WHERE intern_profile_id = $1`,
      [internProfileId],
    );
    if (!cfRows[0]) throw new Error('Career file not found');

    const { rows } = await pool.query(
      `UPDATE career_skills
       SET source = 'mentor_endorsed', endorsed_by = $1, endorsed_at = NOW()
       WHERE id = $2 AND career_file_id = $3
       RETURNING *`,
      [mentorUserId, skillId, cfRows[0].id],
    );
    if (!rows[0]) throw new Error('Skill not found in this career file');

    // Recalculate score for the intern
    const { rows: intern } = await pool.query(
      `SELECT user_id FROM intern_profiles WHERE id = $1`,
      [internProfileId],
    );
    if (intern[0]) await this.calculateAndSaveScore(intern[0].user_id);

    return rows[0];
  }

  // ── Experience ─────────────────────────────────────────────────────────────

  async addExperience(userId: number, data: {
    title: string; organization?: string;
    start_date?: string; end_date?: string;
    is_current?: boolean; description?: string;
  }) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    const { rows } = await pool.query(
      `INSERT INTO career_experiences
         (career_file_id, title, organization, start_date, end_date, is_current, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cf.id, data.title, data.organization ?? null, data.start_date ?? null,
       data.end_date ?? null, data.is_current ?? false, data.description ?? null],
    );
    return rows[0];
  }

  async removeExperience(userId: number, expId: number) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    await pool.query(
      `DELETE FROM career_experiences WHERE id = $1 AND career_file_id = $2`,
      [expId, cf.id],
    );
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async addProject(userId: number, data: {
    title: string; description?: string;
    technologies?: string[]; url?: string;
  }) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    const { rows } = await pool.query(
      `INSERT INTO career_projects
         (career_file_id, title, description, technologies, url, source)
       VALUES ($1,$2,$3,$4,$5,'manual') RETURNING *`,
      [cf.id, data.title, data.description ?? null,
       data.technologies ?? [], data.url ?? null],
    );
    return rows[0];
  }

  async removeProject(userId: number, projectId: number) {
    const pool = getPool();
    const cf = await this.getOrCreate(userId);
    await pool.query(
      `DELETE FROM career_projects WHERE id = $1 AND career_file_id = $2 AND source = 'manual'`,
      [projectId, cf.id],
    );
  }

  // ── Mentor approve Employer Ready tier (point 8) ──────────────────────────

  async approveTier(mentorUserId: number, internProfileId: number) {
    const pool = getPool();

    const { rows: cfRows } = await pool.query(
      `SELECT cf.id, cf.readiness_tier, cf.readiness_score
       FROM career_files cf
       JOIN intern_profiles ip ON ip.id = cf.intern_profile_id
       JOIN users u ON u.id = ip.mentor_id
       WHERE ip.id = $1 AND ip.mentor_id = $2 AND u.deleted_at IS NULL`,
      [internProfileId, mentorUserId],
    );
    if (!cfRows[0]) throw new Error('Not authorized');

    const cf = cfRows[0];
    if (!['internship_ready_plus', 'employer_ready'].includes(cf.readiness_tier)) {
      throw new Error(
        `Intern must reach Internship Ready+ before Employer Ready approval (current: ${cf.readiness_tier})`,
      );
    }

    const { rows } = await pool.query(
      `UPDATE career_files
       SET mentor_approved_tier = TRUE, readiness_tier = 'employer_ready', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [cf.id],
    );
    return rows[0];
  }

  // ── Mentor view of intern career file ─────────────────────────────────────

  async getMentorViewOfIntern(mentorUserId: number, internProfileId: number) {
    const pool = getPool();

    const { rows: check } = await pool.query(
      `SELECT ip.id FROM intern_profiles ip
       JOIN users u ON u.id = ip.mentor_id
       WHERE ip.id = $1 AND ip.mentor_id = $2 AND u.deleted_at IS NULL`,
      [internProfileId, mentorUserId],
    );
    if (!check[0]) throw new Error('Not authorized');

    const { rows: cfRows } = await pool.query(
      `SELECT cf.*, u.name, ip.track, ip.department, ip.course
       FROM career_files cf
       JOIN intern_profiles ip ON ip.id = cf.intern_profile_id
       JOIN users u ON u.id = ip.user_id
       WHERE cf.intern_profile_id = $1`,
      [internProfileId],
    );
    if (!cfRows[0]) return null;
    const cf = cfRows[0];

    const [skills, projects] = await Promise.all([
      pool.query(`SELECT * FROM career_skills WHERE career_file_id = $1 ORDER BY source, skill_name`, [cf.id]),
      pool.query(`SELECT * FROM career_projects WHERE career_file_id = $1 ORDER BY mentor_signed DESC`, [cf.id]),
    ]);

    return { ...cf, skills: skills.rows, projects: projects.rows };
  }

  // ── Public passport (point 5) ─────────────────────────────────────────────

  async getPublicPassport(slug: string) {
    const pool = getPool();
    const { rows: cfRows } = await pool.query(
      `SELECT cf.*, u.name, ip.track, ip.department, ip.course,
              ip.github_url, ip.linkedin_url, ip.portfolio_url
       FROM career_files cf
       JOIN intern_profiles ip ON ip.id = cf.intern_profile_id
       JOIN users u ON u.id = ip.user_id
       WHERE cf.slug = $1
         AND cf.is_public = TRUE
         AND ip.is_approved = TRUE
         AND u.deleted_at IS NULL`,
      [slug],
    );
    if (!cfRows[0]) return null;
    const cf = cfRows[0];

    const [skills, projects] = await Promise.all([
      pool.query(
        `SELECT skill_name, category, source, proficiency, endorsed_at
         FROM career_skills WHERE career_file_id = $1
         ORDER BY
           CASE source
             WHEN 'mentor_endorsed'   THEN 1
             WHEN 'platform_activity' THEN 2
             ELSE 3
           END, skill_name`,
        [cf.id],
      ),
      pool.query(
        `SELECT title, description, technologies, url, verified, mentor_signed
         FROM career_projects WHERE career_file_id = $1
         ORDER BY mentor_signed DESC, verified DESC`,
        [cf.id],
      ),
    ]);

    return {
      name:                cf.name,
      track:               cf.track,
      department:          cf.department,
      course:              cf.course,
      github_url:          cf.github_url,
      linkedin_url:        cf.linkedin_url,
      portfolio_url:       cf.portfolio_url,
      headline:            cf.headline,
      summary:             cf.summary,
      readiness_score:     cf.readiness_score,
      readiness_tier:      cf.readiness_tier,
      mentor_approved_tier: cf.mentor_approved_tier,
      is_public:           cf.is_public,
      slug:                cf.slug,
      skills:              skills.rows,
      projects:            projects.rows,
    };
  }

  // ── Employer intern search (point 3) ──────────────────────────────────────

  async searchInterns(filters: {
    track?: string;
    tier?: string;
    skill?: string;
    verified_only?: boolean;
  }) {
    const pool = getPool();
    const params: unknown[] = [];
    let idx = 1;
    let query = `
      SELECT DISTINCT cf.slug, cf.headline, cf.readiness_score, cf.readiness_tier,
             cf.mentor_approved_tier, u.name, ip.track, ip.department
      FROM career_files cf
      JOIN intern_profiles ip ON ip.id = cf.intern_profile_id
      JOIN users u ON u.id = ip.user_id
      WHERE cf.is_public = TRUE
        AND ip.is_approved = TRUE
        AND u.deleted_at IS NULL
    `;

    if (filters.track) {
      query += ` AND ip.track ILIKE $${idx++}`;
      params.push(`%${filters.track}%`);
    }
    if (filters.tier) {
      query += ` AND cf.readiness_tier = $${idx++}`;
      params.push(filters.tier);
    }
    if (filters.skill) {
      const sourceFilter = filters.verified_only
        ? `AND cs.source IN ('mentor_endorsed','platform_activity')`
        : '';
      query += `
        AND EXISTS (
          SELECT 1 FROM career_skills cs
          WHERE cs.career_file_id = cf.id
            AND cs.skill_name ILIKE $${idx++}
            ${sourceFilter}
        )`;
      params.push(`%${filters.skill}%`);
    }

    query += ` ORDER BY cf.readiness_score DESC LIMIT 50`;
    const { rows } = await pool.query(query, params);
    return rows;
  }

  // ── Admin cohort analytics (point 4) ─────────────────────────────────────

  async getCohortAnalytics() {
    const pool = getPool();

    const [summary, tiers, topInterns, skillsFreq] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_interns,
          ROUND(AVG(readiness_score), 1) AS avg_score,
          COUNT(*) FILTER (WHERE readiness_tier IN
            ('internship_ready','internship_ready_plus','employer_ready'))::int AS internship_ready_count,
          COUNT(*) FILTER (WHERE readiness_tier = 'employer_ready')::int AS employer_ready_count,
          COUNT(*) FILTER (WHERE mentor_approved_tier = TRUE)::int AS mentor_approved_count,
          COUNT(*) FILTER (WHERE is_public = TRUE)::int AS public_passports
        FROM career_files
      `),
      pool.query(`
        SELECT readiness_tier AS tier, COUNT(*)::int AS count
        FROM career_files
        GROUP BY readiness_tier
        ORDER BY CASE readiness_tier
          WHEN 'employer_ready'        THEN 1
          WHEN 'internship_ready_plus' THEN 2
          WHEN 'internship_ready'      THEN 3
          WHEN 'developing'            THEN 4
          ELSE 5
        END
      `),
      pool.query(`
        SELECT cf.readiness_score, cf.readiness_tier, u.name, ip.track,
               cf.mentor_approved_tier, cf.slug
        FROM career_files cf
        JOIN intern_profiles ip ON ip.id = cf.intern_profile_id
        JOIN users u ON u.id = ip.user_id
        WHERE u.deleted_at IS NULL
        ORDER BY cf.readiness_score DESC LIMIT 10
      `),
      pool.query(`
        SELECT cs.skill_name, COUNT(*)::int AS count
        FROM career_skills cs
        JOIN career_files cf ON cf.id = cs.career_file_id
        WHERE cs.source IN ('platform_activity','mentor_endorsed')
        GROUP BY cs.skill_name
        ORDER BY count DESC LIMIT 15
      `),
    ]);

    return {
      ...summary.rows[0],
      tier_breakdown: tiers.rows,
      top_interns:    topInterns.rows,
      top_skills:     skillsFreq.rows,
    };
  }
}
