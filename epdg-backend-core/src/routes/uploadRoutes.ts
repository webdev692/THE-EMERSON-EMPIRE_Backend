import { Router } from 'express';
import { uploadLimiter } from '../middlewares/security';

const router = Router();

// Anonymous service-role uploads cannot be tied to the eventual account owner.
// Keep this route fail-closed until a private, ownership-verifiable flow exists.
router.post('/cv', uploadLimiter, (_req, res) => {
  res.status(503).json({
    success: false,
    message: 'CV upload is temporarily unavailable.',
    errors: [],
  });
});

export default router;
