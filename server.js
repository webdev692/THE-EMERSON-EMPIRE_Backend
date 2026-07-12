'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { loadRuntimeConfig } = require('./config');

const healthRoutes = require('./routes/health');
const agencyRoutes = require('./routes/agency');
const epdgRoutes = require('./routes/epdg');
const publicContributionRoutes = require('./routes/publicContributions');
const certificateRoutes = require('./routes/certificates');

function createApp(config = loadRuntimeConfig()) {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error('Origin is not allowed');
      error.statusCode = 403;
      return callback(error);
    },
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      service: 'the-emerson-empire-backend',
      message: 'Backend API is running. Use /health for service checks.',
    });
  });

  app.use('/health', healthRoutes);
  app.use('/api/agency', agencyRoutes);
  app.use('/api/epdg', epdgRoutes);
  app.use('/api/public-contributions', publicContributionRoutes);
  app.use('/api/certificates', certificateRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  app.use((error, _req, res, _next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error('API request failed', { statusCode });
    res.status(statusCode).json({
      success: false,
      error: statusCode < 500 ? error.message : 'Internal server error',
    });
  });

  return app;
}

function start() {
  const config = loadRuntimeConfig();
  const app = createApp(config);
  return app.listen(config.port, () => {
    console.log('The Emerson Empire backend API started', { port: config.port });
  });
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    console.error('Backend startup failed', { errorType: error.name || 'Error' });
    process.exit(1);
  }
}

module.exports = { createApp, start };
