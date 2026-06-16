import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${err.message || 'Unknown Error'} - Path: ${req.path}`);

  const statusCode = err.statusCode || 500;
  
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || [], 
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};