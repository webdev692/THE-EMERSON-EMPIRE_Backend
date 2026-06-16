import { Router } from 'express';
import multer from 'multer';
import { uploadCV } from '../controllers/UploadController';

const router = Router();

// Store in memory (no temp files on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// POST /api/upload/cv  — public (called before account creation)
router.post('/cv', upload.single('file'), uploadCV);

export default router;
