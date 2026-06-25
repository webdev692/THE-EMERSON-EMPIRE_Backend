import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middlewares/auth';
import * as MentorController from '../controllers/MentorController';

const router = Router();

router.use(authMiddleware);
router.use(roleGuard('admin'));

router.get('/stats',                               MentorController.getStats);
router.get('/interns',                             MentorController.getMyInterns);
router.patch('/interns/:userId/activate-roadmap',  MentorController.activateRoadmap);

export default router;
