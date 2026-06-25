import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { AdminService } from '../services/AdminService';
import { OpportunityService } from '../services/OpportunityService';
import { RoadmapService } from '../services/RoadmapService';
import { parseCvFromUrl } from '../utils/cvParser';
import { getPool } from '../db';

const adminService       = new AdminService();
const opportunityService = new OpportunityService();
const roadmapService     = new RoadmapService();

// GET /api/admin/stats
export const getStats = async (req: Request, res: Response) => {
  try {
    const stats = await adminService.getStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/users?role=&status=&search=
export const getUsers = async (req: Request, res: Response) => {
  try {
    const { role, status, search } = req.query as Record<string, string>;
    const users = await adminService.getUsers({ role, status, search });
    res.json({ success: true, data: users });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/users/:id  — approve or reject
export const updateUser = async (req: Request, res: Response) => {
  try {
    const userId  = Number(req.params.id);
    const adminId = (req as AuthRequest).user.id;

    if (!['approved', 'rejected'].includes(req.body.status)) {
      res.status(400).json({ success: false, message: 'status must be approved or rejected', errors: [] });
      return;
    }

    const updated = await adminService.updateUserStatus(userId, adminId, req.body);
    await adminService.logAuditEvent(adminId, `user.${req.body.status}`, 'user', String(userId));
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const code = err.message === 'User not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// DELETE /api/admin/users/:id  — soft delete
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId  = Number(req.params.id);
    const adminId = (req as AuthRequest).user.id;

    if (userId === adminId) {
      res.status(400).json({ success: false, message: 'Cannot delete your own account.', errors: [] });
      return;
    }

    await adminService.deleteUser(userId);
    await adminService.logAuditEvent(adminId, 'user.delete', 'user', String(userId));
    res.json({ success: true, message: 'User deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/users/:id/cv-analysis
export const getCvAnalysis = async (req: Request, res: Response) => {
  try {
    const pool   = getPool();
    const userId = Number(req.params.id);

    // Fetch intern's cv_url
    const { rows } = await pool.query(
      `SELECT ip.cv_url FROM intern_profiles ip
       JOIN users u ON u.id = ip.user_id
       WHERE ip.user_id = $1 AND u.role = 'intern' AND u.deleted_at IS NULL`,
      [userId]
    );

    if (!rows.length || !rows[0].cv_url) {
      res.status(404).json({ success: false, message: 'No CV found for this intern.', errors: [] });
      return;
    }

    const parsed = await parseCvFromUrl(rows[0].cv_url);
    if (!parsed) {
      res.status(422).json({ success: false, message: 'Could not parse CV. The file may be corrupt or inaccessible.', errors: [] });
      return;
    }

    // Fetch open internship slots
    const slots = await pool.query(
      `SELECT id, title, department, skills_required, description
       FROM internship_slots
       WHERE status = 'open' AND deleted_at IS NULL
       ORDER BY created_at DESC`
    );

    // Category → department mapping
    const CATEGORY_DEPT: Record<string, string> = {
      'Frontend':              'Frontend',
      'Backend':               'Backend',
      'Databases':             'Backend',
      'Programming Languages': 'Full Stack',
      'Cloud & DevOps':        'Full Stack',
      'Design':                'UX/UI',
      'Digital Marketing':     'Marketing',
      'Tools & Practices':     'Full Stack',
      'Soft Skills':           'Sales',
    };

    const DEPT_TITLE: Record<string, string> = {
      'Frontend':   'Frontend Developer Intern',
      'Backend':    'Backend Developer Intern',
      'Full Stack': 'Full Stack Developer Intern',
      'UX/UI':      'UX / UI Design Intern',
      'Marketing':  'Digital Marketing Intern',
      'Sales':      'Business Development Intern',
    };

    const internSkills = new Set(parsed.skills.all.map((s) => s.toLowerCase()));

    let top: any[];

    if (slots.rows.length > 0) {
      // ── Match against real open slots ───────────────────────────────────────
      const recommendations = slots.rows.map((slot) => {
        const required: string[] = Array.isArray(slot.skills_required)
          ? slot.skills_required.map((s: string) => s.toLowerCase())
          : typeof slot.skills_required === 'object' && slot.skills_required
            ? (Object.values(slot.skills_required) as string[][]).flat().map((s) => s.toLowerCase())
            : [];

        let score = 0;
        let matchedSkills: string[] = [];

        if (required.length > 0) {
          matchedSkills = required.filter((s) => internSkills.has(s));
          score = Math.round((matchedSkills.length / required.length) * 100);
        } else {
          const internDepts = Object.entries(parsed.skills.categories)
            .filter(([, skills]) => skills.length > 0)
            .map(([cat]) => CATEGORY_DEPT[cat])
            .filter(Boolean);
          if (slot.department && internDepts.includes(slot.department)) score = 60;
          matchedSkills = parsed.skills.all.slice(0, 5);
        }

        return {
          id:              slot.id,
          title:           slot.title,
          department:      slot.department,
          description:     slot.description,
          score,
          matched_skills:  matchedSkills,
          required_skills: required,
          suggested:       false,
        };
      });

      recommendations.sort((a, b) => b.score - a.score);
      top = recommendations.slice(0, 5);

    } else {
      // ── No open slots — generate department suggestions from skill categories ─
      const deptSkills: Record<string, string[]> = {};

      for (const [category, skills] of Object.entries(parsed.skills.categories)) {
        if (!skills.length) continue;
        const dept = CATEGORY_DEPT[category];
        if (!dept) continue;
        if (!deptSkills[dept]) deptSkills[dept] = [];
        deptSkills[dept].push(...skills);
      }

      const total = parsed.skills.total || 1;

      top = Object.entries(deptSkills)
        .map(([dept, skills], i) => ({
          id:              -(i + 1),
          title:           DEPT_TITLE[dept] ?? `${dept} Intern`,
          department:      dept,
          description:     'Suggested based on skills found in CV — no open slots yet',
          score:           Math.min(100, Math.round((skills.length / total) * 100)),
          matched_skills:  [...new Set(skills)].slice(0, 8),
          required_skills: [],
          suggested:       true,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    res.json({
      success: true,
      data: {
        skills:          parsed.skills,
        recommendations: top,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/mentors
export const getMentors = async (req: Request, res: Response) => {
  try {
    const mentors = await adminService.getMentors();
    res.json({ success: true, data: mentors });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/admin/mentors
export const createMentor = async (req: Request, res: Response) => {
  try {
    const { name, email, password, department, max_capacity } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'name, email and password are required', errors: [] });
      return;
    }
    const mentor = await adminService.createMentor({
      name,
      email,
      password,
      department: department ?? 'Frontend',
      max_capacity: Number(max_capacity) || 3,
    });
    res.status(201).json({ success: true, data: mentor });
  } catch (err: any) {
    const code = err.message?.includes('already') ? 409 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/mentors/:id/reset-password
export const resetMentorPassword = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      res.status(400).json({ success: false, message: 'password must be at least 8 characters', errors: [] });
      return;
    }
    const result = await adminService.resetMentorPassword(Number(req.params.id), password);
    res.json({ success: true, message: `Password reset for ${result.name}. Credentials email sent.` });
  } catch (err: any) {
    const code = err.message === 'Mentor not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// DELETE /api/admin/mentors/:id
export const deactivateMentor = async (req: Request, res: Response) => {
  try {
    await adminService.deactivateMentor(Number(req.params.id));
    res.json({ success: true, message: 'Mentor deactivated.' });
  } catch (err: any) {
    const code = err.message === 'Mentor not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/slots?status=&department=
export const getSlots = async (req: Request, res: Response) => {
  try {
    const { status, department } = req.query as Record<string, string>;
    const slots = await adminService.getSlots({ status, department });
    res.json({ success: true, data: slots });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/admin/slots
export const createSlot = async (req: Request, res: Response) => {
  try {
    if (!req.body.title) {
      res.status(400).json({ success: false, message: 'title is required', errors: [] });
      return;
    }
    const adminId = (req as AuthRequest).user.id;
    const slot = await adminService.createSlot({ ...req.body, created_by: adminId });
    res.status(201).json({ success: true, data: slot });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/slots/:id
export const updateSlot = async (req: Request, res: Response) => {
  try {
    const id   = Number(req.params.id);
    const slot = await adminService.updateSlot(id, req.body);
    res.json({ success: true, data: slot });
  } catch (err: any) {
    const code = err.message === 'Slot not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// DELETE /api/admin/slots/:id
export const deleteSlot = async (req: Request, res: Response) => {
  try {
    await adminService.deleteSlot(Number(req.params.id));
    res.json({ success: true, message: 'Slot deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/admin/users  — manually create a user
export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, role, admin_type, department, max_capacity } = req.body;

    if (!name || !email || !role) {
      res.status(400).json({ success: false, message: 'name, email and role are required.', errors: [] });
      return;
    }

    if (!['admin', 'company', 'intern', 'school'].includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role.', errors: [] });
      return;
    }

    const user = await adminService.createUser({
      name, email, role,
      admin_type:   admin_type   || undefined,
      department:   department   || undefined,
      max_capacity: max_capacity ? Number(max_capacity) : undefined,
    });
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    const code = err.message?.includes('already') ? 409 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Placements ──────────────────────────────────────────────────────────────

export const listPlacements = async (req: Request, res: Response) => {
  try {
    const data = await adminService.listPlacements();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getPlaceableInterns = async (req: Request, res: Response) => {
  try {
    const data = await adminService.getPlaceableInterns();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const createPlacement = async (req: Request, res: Response) => {
  try {
    const { application_id, intern_id, company_id, school_id, slot_id, mentor_id, start_date, end_date } = req.body;
    if (!application_id || !intern_id || !company_id || !slot_id || !start_date || !end_date) {
      res.status(400).json({ success: false, message: 'application_id, intern_id, company_id, slot_id, start_date and end_date are required', errors: [] });
      return;
    }
    const data = await adminService.createPlacement({
      application_id: Number(application_id),
      intern_id:      Number(intern_id),
      company_id:     Number(company_id),
      school_id:      school_id ? Number(school_id) : null,
      slot_id:        Number(slot_id),
      mentor_id:      mentor_id ? Number(mentor_id) : null,
      start_date, end_date,
    });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') || err.message.includes('not approved') ? 404
               : err.message.includes('already exists') ? 409 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

export const endPlacement = async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) {
      res.status(400).json({ success: false, message: 'reason is required', errors: [] });
      return;
    }
    await adminService.endPlacement(Number(req.params.id), reason.trim());
    res.json({ success: true, message: 'Placement ended.' });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Announcements ────────────────────────────────────────────────────────────

export const listAnnouncements = async (req: Request, res: Response) => {
  try {
    const data = await adminService.listAnnouncements();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { subject, message, targetAudience } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      res.status(400).json({ success: false, message: 'subject and message are required', errors: [] });
      return;
    }
    const adminId = (req as AuthRequest).user.id;
    const data = await adminService.createAnnouncement({
      subject:        subject.trim(),
      message:        message.trim(),
      targetAudience: targetAudience || 'all',
      createdBy:      adminId,
    });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Gamification ────────────────────────────────────────────────────────────

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const data = await adminService.getLeaderboard();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const getGamificationAudit = async (req: Request, res: Response) => {
  try {
    const data = await adminService.getAuditLog();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const listBadges = async (req: Request, res: Response) => {
  try {
    const data = await adminService.listBadges();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const adjustPoints = async (req: Request, res: Response) => {
  try {
    const { userId, points, action } = req.body;
    if (!userId || points === undefined || !action?.trim()) {
      res.status(400).json({ success: false, message: 'userId, points and action are required', errors: [] });
      return;
    }
    const adminId = (req as AuthRequest).user.id;
    const intern = await adminService.adjustPoints({
      userId: Number(userId), points: Number(points), action: action.trim(), awardedBy: adminId,
    });
    res.json({ success: true, data: intern, message: `Points applied to ${intern.name}` });
  } catch (err: any) {
    const code = err.message === 'Intern not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

export const awardBadge = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required', errors: [] });
      return;
    }
    const adminId = (req as AuthRequest).user.id;
    await adminService.awardBadge(Number(req.params.id), Number(userId), adminId);
    res.json({ success: true, message: 'Badge awarded.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Cohort Analytics ────────────────────────────────────────────────────────

export const getCohortAnalytics = async (req: Request, res: Response) => {
  try {
    const data = await adminService.getCohortAnalytics();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Resources ───────────────────────────────────────────────────────────────

export const listResources = async (req: Request, res: Response) => {
  try {
    const data = await adminService.listResources();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const createResource = async (req: Request, res: Response) => {
  try {
    const { title, type, url, owner, status } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ success: false, message: 'title is required', errors: [] });
      return;
    }
    const adminId = (req as AuthRequest).user.id;
    const resource = await adminService.createResource({
      title: title.trim(), type, url, owner, status, createdBy: adminId,
    });
    res.status(201).json({ success: true, data: resource });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const updateResource = async (req: Request, res: Response) => {
  try {
    const resource = await adminService.updateResource(Number(req.params.id), req.body);
    res.json({ success: true, data: resource });
  } catch (err: any) {
    const code = err.message === 'Resource not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

export const deleteResource = async (req: Request, res: Response) => {
  try {
    await adminService.deleteResource(Number(req.params.id));
    res.json({ success: true, message: 'Resource deleted.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Feedback ────────────────────────────────────────────────────────────────

export const listFeedback = async (req: Request, res: Response) => {
  try {
    const data = await adminService.listFeedback();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const createFeedback = async (req: Request, res: Response) => {
  try {
    const { fromName, role, category, comment, rating } = req.body;
    if (!fromName?.trim() || !comment?.trim()) {
      res.status(400).json({ success: false, message: 'fromName and comment are required', errors: [] });
      return;
    }
    const data = await adminService.createFeedback({
      fromName: fromName.trim(),
      role:     role     || 'admin',
      category: category || 'General',
      comment:  comment.trim(),
      rating:   Number(rating) || 5,
    });
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const updateFeedback = async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['new', 'reviewed', 'actioned'].includes(status)) {
      res.status(400).json({ success: false, message: 'status must be new, reviewed or actioned', errors: [] });
      return;
    }
    await adminService.updateFeedbackStatus(Number(req.params.id), status);
    res.json({ success: true, message: 'Feedback updated.' });
  } catch (err: any) {
    const code = err.message === 'Feedback not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Platform Settings ───────────────────────────────────────────────────────

export const getSettings = async (req: Request, res: Response) => {
  try {
    const data = await adminService.getSettings();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, message: 'settings object required', errors: [] });
      return;
    }
    await adminService.updateSettings(req.body);
    const adminId = (req as AuthRequest).user.id;
    await adminService.logAuditEvent(adminId, 'settings.update', 'settings', undefined, req.body);
    res.json({ success: true, message: 'Settings saved.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const getAuditLog = async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const data = await adminService.getAuditLogEntries(limit, offset);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Promote / Demote admin ───────────────────────────────────────────────────

export const promoteUser = async (req: Request, res: Response) => {
  try {
    const targetId   = Number(req.params.id);
    const { admin_role } = req.body as { admin_role: 'admin' | 'super_admin' };
    if (!['admin', 'super_admin'].includes(admin_role)) {
      res.status(400).json({ success: false, message: 'admin_role must be admin or super_admin', errors: [] });
      return;
    }
    await adminService.promoteUser(targetId, admin_role);
    const actorId = (req as AuthRequest).user.id;
    await adminService.logAuditEvent(actorId, 'user.role_change', 'user', String(targetId), { admin_role });
    res.json({ success: true, message: `Role updated to ${admin_role}.` });
  } catch (err: any) {
    const code = err.message === 'Admin record not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Opportunities ────────────────────────────────────────────────────────────

// GET /api/admin/opportunities
export const listOpportunities = async (req: Request, res: Response) => {
  try {
    const data = await opportunityService.getOpportunities();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/admin/opportunities
export const createOpportunity = async (req: Request, res: Response) => {
  try {
    const postedBy = (req as AuthRequest).user.id;
    const { type, title } = req.body;
    if (!type || !title) {
      res.status(400).json({ success: false, message: 'type and title are required.', errors: [] });
      return;
    }
    if (!['gig', 'job'].includes(type)) {
      res.status(400).json({ success: false, message: 'type must be gig or job.', errors: [] });
      return;
    }
    const data = await opportunityService.createOpportunity(postedBy, req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/opportunities/:id
export const updateOpportunity = async (req: Request, res: Response) => {
  try {
    const id   = Number(req.params.id);
    const data = await opportunityService.updateOpportunity(id, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message === 'Opportunity not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/opportunities/applications
export const listOpportunityApplications = async (req: Request, res: Response) => {
  try {
    const data = await opportunityService.getAllApplications();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/opportunities/applications/:id
export const reviewOpportunityApplication = async (req: Request, res: Response) => {
  try {
    const appId     = Number(req.params.id);
    const reviewerId = (req as AuthRequest).user.id;
    const { status } = req.body;
    if (!['pending','shortlisted','accepted','rejected'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status.', errors: [] });
      return;
    }
    const data = await opportunityService.reviewApplication(appId, reviewerId, status);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message === 'Application not found.' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// ─── Roadmap admin ────────────────────────────────────────────────────────────

// GET /api/admin/roadmap/pending-level-ups
export const listPendingLevelUps = async (req: Request, res: Response) => {
  try {
    const data = await roadmapService.getPendingLevelUps();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/roadmap/level-up  { intern_profile_id, track_id }
export const approveInternLevelUp = async (req: Request, res: Response) => {
  try {
    const mentorUserId    = (req as AuthRequest).user.id;
    const { intern_profile_id, track_id } = req.body;

    if (!intern_profile_id || !track_id) {
      res.status(400).json({ success: false, message: 'intern_profile_id and track_id are required', errors: [] });
      return;
    }
    const data = await roadmapService.approveLevelUp(
      Number(intern_profile_id),
      Number(track_id),
      mentorUserId,
    );
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not enrolled') ? 404
               : err.message.includes('No level-up request') ? 400
               : err.message.includes('highest level') ? 400
               : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/admin/roadmap/modules/:moduleId/sign-off  { intern_profile_id }
export const signOffModule = async (req: Request, res: Response) => {
  try {
    const mentorUserId      = (req as AuthRequest).user.id;
    const moduleId          = Number(req.params.moduleId);
    const { intern_profile_id } = req.body;

    if (!intern_profile_id) {
      res.status(400).json({ success: false, message: 'intern_profile_id is required', errors: [] });
      return;
    }
    const data = await roadmapService.mentorSignOffModule(
      Number(intern_profile_id),
      moduleId,
      mentorUserId,
    );
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};
