import { Request, Response } from 'express';
import { getSupabase, CV_BUCKET } from '../utils/supabaseClient';
import path from 'path';

// POST /api/upload/cv
export const uploadCV = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded.' });
      return;
    }

    const { buffer, originalname, mimetype } = req.file;
    const ext      = path.extname(originalname).toLowerCase();
    const allowed  = ['.pdf', '.doc', '.docx'];

    if (!allowed.includes(ext)) {
      res.status(400).json({ success: false, message: 'Only PDF, DOC, and DOCX files are accepted.' });
      return;
    }

    const supabase  = getSupabase();
    const fileName  = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath  = `cvs/${fileName}`;

    // Ensure bucket exists
    const { error: bucketErr } = await supabase.storage.createBucket(CV_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    });
    // Ignore "already exists" error
    if (bucketErr && !bucketErr.message.includes('already exists')) {
      throw bucketErr;
    }

    // Upload file
    const { error: uploadErr } = await supabase.storage
      .from(CV_BUCKET)
      .upload(filePath, buffer, { contentType: mimetype, upsert: false });

    if (uploadErr) throw uploadErr;

    // Generate a signed URL valid for 10 years (long-lived for admin review)
    const { data: signedData, error: signErr } = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);

    if (signErr || !signedData?.signedUrl) throw signErr ?? new Error('Failed to generate signed URL');

    res.json({ success: true, url: signedData.signedUrl, path: filePath });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'File upload failed.' });
  }
};
