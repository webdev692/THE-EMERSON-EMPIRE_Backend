import { Router } from 'express';
import { verify } from '../controllers/CertificateController';
import { getPublicPassport } from '../controllers/CareerFileController';

const router = Router();

// Public — no auth middleware
router.get('/verify/:certificateId', verify);
router.get('/passport/:slug',        getPublicPassport);

export default router;
