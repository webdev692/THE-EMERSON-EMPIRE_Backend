import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { AdminService } from '../services/AdminService';
import { parseCvFromUrl } from '../utils/cvParser';
import { getPool } from '../db';

const adminService = new AdminService();

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
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      res.status(400).json({ success: false, message: 'name, email, password and role are required.', errors: [] });
      return;
    }

    if (!['admin', 'company', 'intern', 'school'].includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role.', errors: [] });
      return;
    }

    const user = await adminService.createUser({ name, email, password, role });
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    const code = err.message?.includes('already') ? 409 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};
