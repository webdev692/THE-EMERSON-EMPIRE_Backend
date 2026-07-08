const express = require('express');
const db = require('../db');
const { cleanString, requireFields, isValidUrl, moduleEnabled } = require('./utils');

const router = express.Router();

router.post('/deliverable-submissions', async (req, res, next) => {
  if (!moduleEnabled('EPDG_MODULE_ENABLED')) {
    return res.status(503).json({ success: false, error: 'EPDG module is currently disabled.' });
  }

  try {
    const errors = requireFields(req.body, ['taskId', 'placementId', 'internId', 'fileUrl']);

    if (!isValidUrl(req.body.fileUrl)) {
      errors.push('fileUrl must be a valid URL');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const result = await db.query(
      `insert into epdg.submissions
        (task_id, placement_id, intern_id, file_url, file_name, file_size_kb, notes, status, submitted_at)
       values ($1, $2, $3, $4, $5, $6, $7, 'submitted', now())
       returning id, status, submitted_at`,
      [
        req.body.taskId,
        req.body.placementId,
        req.body.internId,
        cleanString(req.body.fileUrl),
        cleanString(req.body.fileName),
        req.body.fileSizeKb || null,
        cleanString(req.body.notes),
      ]
    );

    return res.status(201).json({ success: true, submission: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/portfolio-evidence', async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Portfolio evidence endpoint is documented but not yet implemented. Confirm the final Supabase table before enabling writes.',
  });
});

module.exports = router;
