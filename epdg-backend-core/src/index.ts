import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { testConnection, performMigration } from './db';
import { logger } from './utils/logger';
import { corsOptions } from './utils/corsconfig';

// new middlewares isolated imports
import { authLimiter } from './middlewares/security';
import { errorHandler } from './middlewares/errorHandler';

import authRoutes   from './routes/authRoutes';
import adminRoutes  from './routes/adminRoutes';
import internRoutes from './routes/internRoutes';
import uploadRoutes from './routes/uploadRoutes';

const app = express();
const PORT = process.env.PORT || 8000;

// Trust Railway's reverse proxy so express-rate-limit can read the real client IP
app.set('trust proxy', 1);

// --- Middlewares Globais ---
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --- Documentation ---
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Emerson API Docs',
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// --- Health Check ---
app.get('/health', (req, res) => {
  res.status(200).json({ message: 'Server is running!' });
});

// --- Routes ---
app.use('/api/auth',   authLimiter, authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/intern', internRoutes);
app.use('/api/onboarding', internRoutes);
app.use('/api/upload', uploadRoutes); 

// --- Error Handling ---
app.use(errorHandler);

async function start(): Promise<void> {
  try {
    await testConnection();
    await performMigration();
    logger.success('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database — shutting down', error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    logger.success(`Server running on http://localhost:${PORT}`);
    logger.info(`API docs at http://localhost:${PORT}/api-docs`);
  });
}

start();