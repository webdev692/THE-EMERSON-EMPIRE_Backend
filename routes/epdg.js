'use strict';

const express = require('express');

const router = express.Router();

// The legacy foundation service has no authentication or ownership checks.
// Keep this previously public write route unavailable rather than accepting an
// intern/user id supplied by an unauthenticated caller.
router.post('/deliverable-submissions', (_req, res) => {
  return res.status(503).json({
    success: false,
    error: 'Deliverable submissions are unavailable on this service.',
  });
});

router.post('/portfolio-evidence', (_req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Portfolio evidence is not implemented on this service.',
  });
});

module.exports = router;
