import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { validationResult } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';

const authService = new AuthService();

export const register = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }
    const { token } = req.body;
    const result = await authService.refreshToken(token);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    res.status(401).json({ success: false, message: error.message || 'Invalid token', errors: [] });
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
    res.status(400).json({ success: false, message: msg, errors: [] });
  }
};

export const resendVerification = async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
      return;
    }
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    const msg = error.message || 'Password reset failed';
    res.status(400).json({ success: false, message: msg, errors: [] });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = await authService.getMe(authReq.user.id);
    res.status(200).json({ success: true, user });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message || 'User not found', errors: [] });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    await authService.logout();
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Logout failed', errors: [] });
  }
};
