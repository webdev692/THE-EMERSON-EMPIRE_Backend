import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { testConnection } from './config/database';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

// Import routes
// import userRoutes from './routes/userRoutes';
import contactRoutes from './routes/contactRoutes';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Emerson API Docs',
}));

// Raw OpenAPI JSON spec
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Server is running!
 */
app.get('/health', (req, res) => {
  res.status(200).json({ message: 'Server is running!' });
});

// Routes
// app.use('/api/users', userRoutes);
app.use('/api/contact', contactRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.stack || err.message);
  res.status(500).json({ message: 'Internal Server Error' });
});

// Start server
async function start(): Promise<void> {
  try {
    await testConnection();
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
