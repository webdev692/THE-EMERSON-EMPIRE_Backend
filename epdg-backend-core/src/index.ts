import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { validateEnvironment } from './config/env';
import { testConnection } from './db';
import { logger } from './utils/logger';

export async function start(): Promise<void> {
  let stage: 'environment' | 'database' | 'application' = 'environment';
  try {
    const { port } = validateEnvironment();
    stage = 'database';
    await testConnection();
    logger.success('Database connected successfully');

    stage = 'application';
    const app = createApp();
    app.listen(port, () => {
      logger.success('Server started', { port });
    });
  } catch (error) {
    logger.error('Backend startup failed', {
      stage,
      errorType: error instanceof Error ? error.name : 'Error',
    });
    process.exit(1);
  }
}

if (require.main === module) {
  void start();
}
