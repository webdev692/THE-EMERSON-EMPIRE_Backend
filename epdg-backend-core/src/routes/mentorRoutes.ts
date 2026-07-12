import { Router } from 'express';
import { authMiddleware, mentorGuard } from '../middlewares/auth';
import * as MentorController from '../controllers/MentorController';
import * as CareerFileController from '../controllers/CareerFileController';

const router = Router();

router.use(authMiddleware);
router.use(mentorGuard);

router.get('/stats',                               MentorController.getStats);
router.get('/interns',                             MentorController.getMyInterns);
router.patch('/interns/:userId/activate-roadmap',  MentorController.activateRoadmap);

// Career File — mentor can view intern files, endorse skills, approve tier
router.get('/career-file/:internProfileId',                               CareerFileController.getMentorViewOfIntern);
router.patch('/career-file/:internProfileId/skills/:skillId/endorse',     CareerFileController.endorseSkill);
router.patch('/career-file/:internProfileId/approve-tier',                CareerFileController.approveTier);

export default router;
