const express = require('express');
const { checkDatabase } = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  const database = await checkDatabase();

  res.status(database.ok || !database.configured ? 200 : 503).json({
    success: database.ok || !database.configured,
    service: 'the-emerson-empire-backend',
    status: database.ok ? 'ok' : database.configured ? 'degraded' : 'configured_without_database',
    database,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
