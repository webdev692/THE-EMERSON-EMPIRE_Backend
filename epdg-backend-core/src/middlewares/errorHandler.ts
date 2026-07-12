import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const candidate = err as { statusCode?: unknown; message?: unknown; name?: unknown };
  const statusCode = typeof candidate?.statusCode === 'number' && candidate.statusCode >= 400 && candidate.statusCode < 600
    ? candidate.statusCode
    : 500;
  const publicMessage = statusCode < 500 && typeof candidate?.message === 'string'
    ? candidate.message
    : 'Internal server error';

  logger.error('Request failed', {
    method: req.method,
    statusCode,
    errorType: typeof candidate?.name === 'string' ? candidate.name : 'Error',
  });

  res.status(statusCode).json({
    success: false,
    message: publicMessage,
    errors: [],
  });
};
