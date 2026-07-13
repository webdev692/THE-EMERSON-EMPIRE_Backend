const express = require('express');
const { checkDatabase } = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  const database = await checkDatabase();

  res.status(database.ok ? 200 : 503).json({
    success: database.ok,
    service: 'the-emerson-empire-backend',
    status: database.ok ? 'ok' : 'unavailable',
    database,
  });
});

module.exports = router;
