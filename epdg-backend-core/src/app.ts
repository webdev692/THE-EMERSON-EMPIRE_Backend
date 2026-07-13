import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { testConnection } from './db';
import { logger } from './utils/logger';
import { corsOptions } from './utils/corsconfig';
import { authLimiter } from './middlewares/security';
import { errorHandler } from './middlewares/errorHandler';
import { sanitizeServerErrors } from './middlewares/sanitizeServerErrors';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import internRoutes from './routes/internRoutes';
import mentorRoutes from './routes/mentorRoutes';
import uploadRoutes from './routes/uploadRoutes';
import userRoutes from './routes/userRoutes';
import verifyRoutes from './routes/verifyRoutes';

export interface AppDependencies {
  readinessCheck?: () => Promise<void>;
}

export function createApp({ readinessCheck = testConnection }: AppDependencies = {}): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(sanitizeServerErrors);

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Emerson API Docs',
  }));

  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  app.get('/health', async (_req, res) => {
    try {
      await readinessCheck();
      res.status(200).json({
        success: true,
        service: 'epdg-backend-core',
        status: 'ok',
      });
    } catch {
      logger.warn('Readiness check failed', { component: 'database' });
      res.status(503).json({
        success: false,
        service: 'epdg-backend-core',
        status: 'unavailable',
      });
    }
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/mentor', mentorRoutes);
  app.use('/api/intern', internRoutes);
  app.use('/api/onboarding', internRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', verifyRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
      errors: [],
    });
  });

  app.use(errorHandler);
  return app;
}
