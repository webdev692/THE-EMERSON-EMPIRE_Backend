import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';

const authService = new AuthService();

function publicValidationErrors(req: Request) {
  return validationResult(req).array({ onlyFirstError: true }).map((error) => {
    const message = String(error.msg);
    return 'path' in error ? { field: error.path, message } : { message };
  });
}

export const register = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    if (error.message === 'Email already registered') {
      res.status(409).json({ success: false, message: error.message, errors: [] });
    } else {
      res.status(500).json({ success: false, message: error.message || 'Internal server error', errors: [] });
    }
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const { email, password, role } = req.body;
    const result = await authService.login(email, password, role);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const msg = error.message || 'Login failed';
    if (msg.includes('Invalid') || msg.includes('Please verify')) {
      res.status(401).json({ success: false, message: msg, errors: [] });
    } else {
      res.status(500).json({ success: false, message: msg, errors: [] });
    }
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const { token } = req.body;
    const result = await authService.refreshToken(token);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const message = error.message || '';
    if (['Invalid access token', 'User not found', 'User role not found'].includes(message)) {
      res.status(401).json({ success: false, message: 'Invalid or expired token', errors: [] });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
    }
  }
};

export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token) {
      res.status(400).json({ success: false, message: 'Token is required', errors: [] });
      return;
    }
    await authService.verifyEmail(token as string);
    res.status(200).json({ success: true, message: 'Email verified successfully' });
  } catch (error: any) {
    const msg = error.message || 'Verification failed';
    if (['Invalid verification token', 'Verification token has expired'].includes(msg)) {
      res.status(400).json({ success: false, message: msg, errors: [] });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
    }
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const { email } = req.body;
    const result = await authService.resendVerification(email);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to resend verification', errors: [] });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Failed to process request', errors: [] });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const errors = publicValidationErrors(req);
    if (errors.length > 0) {
      res.status(400).json({ success: false, message: 'Validation failed', errors });
      return;
    }
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const msg = error.message || 'Password reset failed';
    if (['Invalid or expired reset token', 'Invalid reset token', 'User not found'].includes(msg)) {
      res.status(400).json({ success: false, message: msg, errors: [] });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
    }
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await authService.getMe(authReq.user.id);
    res.status(200).json({ success: true, user });
  } catch (error: any) {
    if (error.message === 'User not found') {
      res.status(404).json({ success: false, message: 'User not found', errors: [] });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error', errors: [] });
    }
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    await authService.logout();
    res.status(200).json({
      success: true,
      message: 'Local session can be cleared. Server-side token revocation is not configured.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Logout failed', errors: [] });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      res.status(400).json({ success: false, message: 'current_password and new_password are required', errors: [] });
      return;
    }
    if (new_password.length < 8) {
      res.status(400).json({ success: false, message: 'New password must be at least 8 characters', errors: [] });
      return;
    }
    const userId = (req as AuthRequest).user.id;
    await authService.changePassword(userId, current_password, new_password);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    const code = error.message === 'Current password is incorrect' ? 400 : 500;
    res.status(code).json({ success: false, message: error.message, errors: [] });
  }
};
