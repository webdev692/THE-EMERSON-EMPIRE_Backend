import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, roleGuard } from '../middlewares/auth';
import * as InternController from '../controllers/InternController';
import * as ApplicationController from '../controllers/ApplicationController';
import * as CareerFileController from '../controllers/CareerFileController';

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

// Opportunities (gigs / jobs) — /applications must come before /:id/apply
router.get('/opportunities/applications',  roleGuard('intern'), InternController.getMyOpportunityApplications);
router.get('/opportunities',               roleGuard('intern'), InternController.getOpportunities);
router.post('/opportunities/:id/apply',    roleGuard('intern'), InternController.applyToOpportunity);

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

// Roadmap — module completion + level-up must come before /roadmap to avoid route conflicts
router.post('/roadmap/modules/:id/complete',  roleGuard('intern'), InternController.completeModule);
router.post('/roadmap/request-level-up',      roleGuard('intern'), InternController.requestLevelUp);
router.get('/roadmap',                        roleGuard('intern'), InternController.getRoadmap);

// Mentors directory (all mentors + specializations)
router.get('/mentors-directory', roleGuard('intern'), InternController.getMentorsDirectory);

// Mentor & Sessions
router.get('/mentor',                        roleGuard('intern'), InternController.getMentor);
router.get('/mentor/sessions',               roleGuard('intern'), InternController.getMentorSessions);
router.post('/mentor/sessions',              roleGuard('intern'), InternController.requestMentorSession);
router.patch('/mentor/sessions/:id/rate',    roleGuard('intern'), InternController.rateMentorSession);

// Progress
router.get('/progress/stats',  roleGuard('intern'), InternController.getProgressStats);
router.get('/progress/skills', roleGuard('intern'), InternController.getSkills);

// Career File
router.get('/career-file',                      roleGuard('intern'), CareerFileController.getCareerFile);
router.put('/career-file',                      roleGuard('intern'), CareerFileController.updateCareerFile);
router.post('/career-file/auto-populate',       roleGuard('intern'), CareerFileController.autoPopulate);
router.post('/career-file/skills',              roleGuard('intern'), CareerFileController.addSkill);
router.delete('/career-file/skills/:id',        roleGuard('intern'), CareerFileController.removeSkill);
router.post('/career-file/experiences',         roleGuard('intern'), CareerFileController.addExperience);
router.delete('/career-file/experiences/:id',   roleGuard('intern'), CareerFileController.removeExperience);
router.post('/career-file/projects',            roleGuard('intern'), CareerFileController.addProject);
router.delete('/career-file/projects/:id',      roleGuard('intern'), CareerFileController.removeProject);

export default router;
