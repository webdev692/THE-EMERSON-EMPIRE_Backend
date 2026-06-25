import { Request, Response } from 'express';
import { CareerFileService } from '../services/CareerFileService';

const svc = new CareerFileService();

// ── Intern ─────────────────────────────────────────────────────────────────

export const getCareerFile = async (req: Request, res: Response) => {
  try {
    const data = await svc.getCareerFile((req as any).user.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateCareerFile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data   = await svc.updateCareerFile(userId, req.body);
    await svc.calculateAndSaveScore(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const autoPopulate = async (req: Request, res: Response) => {
  try {
    const data = await svc.autoPopulate((req as any).user.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addSkill = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data   = await svc.addSkill(userId, req.body);
    await svc.calculateAndSaveScore(userId);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const removeSkill = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await svc.removeSkill(userId, parseInt(req.params.id));
    await svc.calculateAndSaveScore(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addExperience = async (req: Request, res: Response) => {
  try {
    const data = await svc.addExperience((req as any).user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const removeExperience = async (req: Request, res: Response) => {
  try {
    await svc.removeExperience((req as any).user.id, parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const data   = await svc.addProject(userId, req.body);
    await svc.calculateAndSaveScore(userId);
    res.status(201).json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const removeProject = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await svc.removeProject(userId, parseInt(req.params.id));
    await svc.calculateAndSaveScore(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Mentor ─────────────────────────────────────────────────────────────────

export const getMentorViewOfIntern = async (req: Request, res: Response) => {
  try {
    const mentorUserId    = (req as any).user.id;
    const internProfileId = parseInt(req.params.internProfileId);
    const data = await svc.getMentorViewOfIntern(mentorUserId, internProfileId);
    if (!data) return res.status(404).json({ success: false, message: 'Career file not found' });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(403).json({ success: false, message: err.message });
  }
};

export const endorseSkill = async (req: Request, res: Response) => {
  try {
    const mentorUserId    = (req as any).user.id;
    const internProfileId = parseInt(req.params.internProfileId);
    const skillId         = parseInt(req.params.skillId);
    const data = await svc.endorseSkill(mentorUserId, internProfileId, skillId);
    res.json({ success: true, data });
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
};

export const approveTier = async (req: Request, res: Response) => {
  try {
    const mentorUserId    = (req as any).user.id;
    const internProfileId = parseInt(req.params.internProfileId);
    const data = await svc.approveTier(mentorUserId, internProfileId);
    res.json({ success: true, data });
  } catch (err: any) {
    const status = err.message.includes('Not authorized') ? 403 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ── Public ─────────────────────────────────────────────────────────────────

export const getPublicPassport = async (req: Request, res: Response) => {
  try {
    const data = await svc.getPublicPassport(req.params.slug);
    if (!data) return res.status(404).json({ success: false, message: 'Passport not found or set to private' });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Admin ─────────────────────────────────────────────────────────────────

export const getCohortAnalytics = async (req: Request, res: Response) => {
  try {
    const data = await svc.getCohortAnalytics();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const searchInterns = async (req: Request, res: Response) => {
  try {
    const { track, tier, skill, verified_only } = req.query;
    const data = await svc.searchInterns({
      track:         track as string | undefined,
      tier:          tier  as string | undefined,
      skill:         skill as string | undefined,
      verified_only: verified_only === 'true',
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
