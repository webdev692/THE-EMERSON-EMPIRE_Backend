import { Request, Response, NextFunction } from 'express';

// Example error handling middleware
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

// Example authentication middleware
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // TODO: Implement authentication logic (JWT verification, etc.)
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  next();
};
