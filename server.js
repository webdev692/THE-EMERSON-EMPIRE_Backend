require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const healthRoutes = require('./routes/health');
const agencyRoutes = require('./routes/agency');
const epdgRoutes = require('./routes/epdg');
const publicContributionRoutes = require('./routes/publicContributions');
const certificateRoutes = require('./routes/certificates');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : [];

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS policy does not allow this origin.'));
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
  console.error('API error:', error.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`The Emerson Empire backend API running on port ${PORT}`);
});
