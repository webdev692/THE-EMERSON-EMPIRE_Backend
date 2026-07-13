import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getPool } from '../db';
import { requireEnvironmentVariable } from '../config/env';

type AccountStatus = 'approved' | 'pending' | 'rejected' | 'unverified';

interface AccessRow {
  id: number;
  email: string;
  is_verified: boolean;
  role_name: string;
  admin_role: string | null;
  core_rejection_reason: string | null;
  epdg_rejection_reason: string | null;
  company_approved: boolean | null;
  school_approved: boolean | null;
  intern_approved: boolean | null;
  intern_rejection_reason: string | null;
  admin_profile_id: number | null;
  is_mentor: boolean | null;
  force_password_change: boolean | null;
}

export interface AuthRequest extends Request {
  user: {
    id: number;
    email: string;
    role: string;
    status: AccountStatus;
    admin_role?: string;
    is_mentor: boolean;
    force_password_change: boolean;
  };
}

function getAccountStatus(row: AccessRow): AccountStatus {
  if (!row.is_verified) return 'unverified';

  const rejected = Boolean(
    row.core_rejection_reason ||
    row.epdg_rejection_reason ||
    row.intern_rejection_reason,
  );
  if (rejected) return 'rejected';

  if (row.role_name === 'admin') {
    return row.admin_profile_id === null ? 'pending' : 'approved';
  }

  if (row.role_name === 'company') {
    return row.company_approved ? 'approved' : 'pending';
  }
  if (row.role_name === 'school') {
    return row.school_approved ? 'approved' : 'pending';
  }
  if (row.role_name === 'intern') {
    return row.intern_approved ? 'approved' : 'pending';
  }
  return 'pending';
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Access denied. No token provided.', errors: [] });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  let userId: number;
  try {
    const decoded = jwt.verify(
      token,
      requireEnvironmentVariable('JWT_SECRET'),
      { algorithms: ['HS256'] },
    ) as { id?: unknown; purpose?: unknown };
    if (
      decoded.purpose !== 'access' ||
      !Number.isInteger(decoded.id) ||
      Number(decoded.id) < 1
    ) {
      throw new Error('Invalid token claims');
    }
    userId = Number(decoded.id);
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token', errors: [] });
    return;
  }

  try {
    const { rows } = await getPool().query<AccessRow>(
      `SELECT
         cu.id,
         cu.email,
         cu.is_verified,
         ubr.role_name::text,
         ubr.admin_role::text,
         ubr.rejection_reason AS core_rejection_reason,
         eu.rejection_reason AS epdg_rejection_reason,
         c.is_approved AS company_approved,
         s.is_approved AS school_approved,
         ip.is_approved AS intern_approved,
         ip.rejection_reason AS intern_rejection_reason,
         a.user_id AS admin_profile_id,
         a.is_mentor,
         a.force_password_change
       FROM core.users cu
       JOIN core.user_branch_roles ubr ON ubr.user_id = cu.id
       JOIN core.branches b ON b.id = ubr.branch_id AND b.code = 'epdg'
       JOIN epdg.users eu ON eu.id = cu.id AND eu.deleted_at IS NULL
       LEFT JOIN epdg.companies c ON c.user_id = cu.id AND c.deleted_at IS NULL
       LEFT JOIN epdg.schools s ON s.user_id = cu.id AND s.deleted_at IS NULL
       LEFT JOIN epdg.intern_profiles ip ON ip.user_id = cu.id
       LEFT JOIN epdg.admins a ON a.user_id = cu.id
       WHERE cu.id = $1 AND cu.deleted_at IS NULL`,
      [userId],
    );

    if (!rows.length) {
      res.status(401).json({ success: false, message: 'Invalid or expired token', errors: [] });
      return;
    }

    const row = rows[0];
    (req as AuthRequest).user = {
      id: row.id,
      email: row.email,
      role: row.role_name,
      status: getAccountStatus(row),
      admin_role: row.admin_role ?? undefined,
      is_mentor: row.is_mentor ?? false,
      force_password_change: row.force_password_change ?? false,
    };
    next();
  } catch (error) {
    next(error);
  }
};

function accountCanUseProtectedRoutes(user: AuthRequest['user']): boolean {
  return user.status === 'approved' && !user.force_password_change;
}

export const roleGuard = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.', errors: [] });
      return;
    }
    if (!accountCanUseProtectedRoutes(authReq.user)) {
      res.status(403).json({ success: false, message: 'Account is not approved for this action.', errors: [] });
      return;
    }
    next();
  };
};

export const mentorGuard = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  if (
    !authReq.user ||
    authReq.user.role !== 'admin' ||
    !authReq.user.is_mentor ||
    !accountCanUseProtectedRoutes(authReq.user)
  ) {
    res.status(403).json({ success: false, message: 'Access denied. Mentor access required.', errors: [] });
    return;
  }
  next();
};

export const superAdminGuard = (req: Request, res: Response, next: NextFunction) => {
  const authReq = req as AuthRequest;
  if (!authReq.user || authReq.user.admin_role !== 'super_admin') {
    res.status(403).json({ success: false, message: 'Access denied. Super admin required.', errors: [] });
    return;
  }
  next();
};
