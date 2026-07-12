import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { validateEnvironment } from './config/env';
import { testConnection } from './db';
import { logger } from './utils/logger';

export async function start(): Promise<void> {
  try {
    const { port } = validateEnvironment();
    await testConnection();
    logger.success('Database connected successfully');

    const app = createApp();
    app.listen(port, () => {
      logger.success('Server started', { port });
    });
  } catch (error) {
    logger.error('Backend startup failed', error);
    process.exit(1);
  }
}

if (require.main === module) {
  void start();
}
