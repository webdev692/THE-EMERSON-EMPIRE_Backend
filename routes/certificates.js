const express = require('express');
const db = require('../db');
const { cleanString, moduleEnabled } = require('./utils');

const router = express.Router();

router.get('/:certificateNumber', async (req, res, next) => {
  if (!moduleEnabled('CERTIFICATE_VERIFICATION_ENABLED')) {
    return res.status(503).json({ success: false, error: 'Certificate verification is currently disabled.' });
  }

  try {
    const certificateNumber = cleanString(req.params.certificateNumber);

    if (!certificateNumber) {
      return res.status(400).json({ success: false, error: 'certificateNumber is required' });
    }

    const result = await db.query(
      `select
         certificate_number,
         intern_name_snapshot,
         department_snapshot,
         program_name,
         issue_date,
         status,
         created_at
       from epdg.certificates
       where certificate_number = $1
       limit 1`,
      [certificateNumber]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const certificate = result.rows[0];

    if (certificate.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Certificate is not active' });
    }

    return res.status(200).json({ success: true, certificate });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
