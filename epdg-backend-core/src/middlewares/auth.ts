import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'default-dev-secret-change-in-production';

export interface AuthRequest extends Request {
  user: {
    id: number;
    email: string;
    role: string;
  };
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.', errors: [] });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string; role: string };
    (req as AuthRequest).user = { id: decoded.id, email: decoded.email, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token', errors: [] });
  }
};

export const roleGuard = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.', errors: [] });
      return;
    }
    next();
  };
};
