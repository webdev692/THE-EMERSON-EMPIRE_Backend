import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, roleGuard } from '../middlewares/auth';
import * as InternController from '../controllers/InternController';
import * as ApplicationController from '../controllers/ApplicationController';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

router.use(authMiddleware);

// Dashboard
router.get('/dashboard', roleGuard('intern'), InternController.getDashboard);

// Profile
router.get('/profile',   roleGuard('intern'), InternController.getProfile);
router.patch('/profile', roleGuard('intern'), InternController.updateProfile);

// Onboarding — new flow (must come before :stepId route)
router.get('/onboarding/status',              roleGuard('intern'), InternController.getOnboardingStatus);
router.post('/onboarding/sign-agreement',     roleGuard('intern'), InternController.signAgreement);
router.post('/onboarding/confirm-track',      roleGuard('intern'), InternController.confirmTrack);
router.post('/onboarding/submit-discovery',   roleGuard('intern'), InternController.submitDiscovery);

// Onboarding — legacy step flow (kept for backwards compatibility)
router.get('/onboarding',                    roleGuard('intern'), InternController.getOnboarding);
router.patch('/onboarding/:stepId/complete', roleGuard('intern'), InternController.completeOnboardingStep);

// Applications / Slots
router.get('/slots',        roleGuard('intern'), ApplicationController.getOpenSlots);
router.post('/apply',       roleGuard('intern'), ApplicationController.apply);
router.get('/applications', roleGuard('intern'), ApplicationController.getMyApplications);

// Tasks
router.get('/tasks',         roleGuard('intern'), InternController.getTasks);
router.patch('/tasks/:id',   roleGuard('intern'), InternController.updateTaskStatus);

// Submissions
router.get('/submissions',                                                          roleGuard('intern'), InternController.getSubmissions);
router.post('/submissions/upload', roleGuard('intern'), upload.single('file'),      InternController.uploadSubmissionFile);
router.post('/submissions',                                                         roleGuard('intern'), InternController.createSubmission);
router.patch('/submissions/:id',                                                    roleGuard('intern'), InternController.resubmit);

// Leaderboard
router.get('/leaderboard',    roleGuard('intern'), InternController.getLeaderboard);
router.get('/leaderboard/me', roleGuard('intern'), InternController.getMyRank);

// Badges
router.get('/badges', roleGuard('intern'), InternController.getBadges);

// Feedback
router.post('/feedback',          roleGuard('intern'), InternController.submitFeedback);
router.get('/feedback/received',  roleGuard('intern'), InternController.getReceivedFeedback);

// Roadmap
router.get('/roadmap', roleGuard('intern'), InternController.getRoadmap);

// Mentor & Sessions
router.get('/mentor',                        roleGuard('intern'), InternController.getMentor);
router.get('/mentor/sessions',               roleGuard('intern'), InternController.getMentorSessions);
router.post('/mentor/sessions',              roleGuard('intern'), InternController.requestMentorSession);
router.patch('/mentor/sessions/:id/rate',    roleGuard('intern'), InternController.rateMentorSession);

// Progress
router.get('/progress/stats',  roleGuard('intern'), InternController.getProgressStats);
router.get('/progress/skills', roleGuard('intern'), InternController.getSkills);

export default router;
