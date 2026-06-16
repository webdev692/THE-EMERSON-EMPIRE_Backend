import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { ApplicationService } from '../services/ApplicationService';

const applicationService = new ApplicationService();

// GET /api/intern/slots
export const getOpenSlots = async (req: Request, res: Response) => {
  try {
    const slots = await applicationService.getOpenSlots();
    res.json({ success: true, data: slots });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// POST /api/intern/apply
export const apply = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { slot_id, cover_letter } = req.body;

    if (!slot_id) {
      res.status(400).json({ success: false, message: 'slot_id is required.', errors: [] });
      return;
    }

    const result = await applicationService.apply(userId, { slot_id: Number(slot_id), cover_letter });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    const code = err.message?.includes('already applied') ? 409
               : err.message?.includes('not found') ? 404
               : err.message?.includes('full') ? 400
               : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/intern/applications
export const getMyApplications = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await applicationService.getMyApplications(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/admin/applications  — admin view with extracted skills
export const getAllApplications = async (req: Request, res: Response) => {
  try {
    const { status, slot_id } = req.query as Record<string, string>;
    const data = await applicationService.getAllApplications({
      status,
      slot_id: slot_id ? Number(slot_id) : undefined,
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};
