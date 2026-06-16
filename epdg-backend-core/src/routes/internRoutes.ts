import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middlewares/auth';
import * as InternController from '../controllers/InternController';
import * as ApplicationController from '../controllers/ApplicationController';

const router = Router();

// All intern routes require valid JWT
router.use(authMiddleware);

// Dashboard
router.get('/dashboard', roleGuard('intern'), InternController.getDashboard);

// Profile
router.get('/profile',   roleGuard('intern'), InternController.getProfile);
router.patch('/profile', roleGuard('intern'), InternController.updateProfile);

// Onboarding
router.get('/onboarding',                    roleGuard('intern'), InternController.getOnboarding);
router.patch('/onboarding/:stepId/complete', roleGuard('intern'), InternController.completeOnboardingStep);

// Applications
router.get('/slots',        roleGuard('intern'), ApplicationController.getOpenSlots);
router.post('/apply',       roleGuard('intern'), ApplicationController.apply);
router.get('/applications', roleGuard('intern'), ApplicationController.getMyApplications);

export default router;
