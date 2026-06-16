import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { InternService } from '../services/InternService';

const internService = new InternService();

// GET /api/intern/dashboard
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.getDashboard(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/intern/profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.getProfile(userId);
    res.json({ success: true, data });
  } catch (err: any) {
    const code = err.message === 'Profile not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/intern/profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const data   = await internService.updateProfile(userId, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// GET /api/onboarding  (accessible from Dashboard route)
export const getOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const steps  = await internService.getOnboardingSteps(userId);
    res.json(steps);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message, errors: [] });
  }
};

// PATCH /api/onboarding/:stepId/complete
export const completeOnboardingStep = async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const stepId = Number(req.params.stepId);

    if (isNaN(stepId) || stepId < 1 || stepId > 6) {
      res.status(400).json({ success: false, message: 'Invalid step ID (1–6).', errors: [] });
      return;
    }

    const steps = await internService.completeOnboardingStep(userId, stepId);
    res.json(steps);
  } catch (err: any) {
    const code = err.message?.includes('not the current step') ? 400 : 500;
    res.status(code).json({ success: false, message: err.message, errors: [] });
  }
};
