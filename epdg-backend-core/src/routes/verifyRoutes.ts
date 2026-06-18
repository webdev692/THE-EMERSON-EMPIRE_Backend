import { Router } from 'express';
import { verify } from '../controllers/CertificateController';

const router = Router();

// Public — no auth middleware
router.get('/verify/:certificateId', verify);

export default router;
