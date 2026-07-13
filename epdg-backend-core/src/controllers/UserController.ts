import { Request, Response } from 'express';

function unavailable(_req: Request, res: Response): void {
  res.status(501).json({
    success: false,
    message: 'Legacy user scaffold is not implemented. Use the reviewed administrative user routes.',
    errors: [],
  });
}

export const getAllUsers = unavailable;
export const getUserById = unavailable;
export const createUser = unavailable;
export const updateUser = unavailable;
export const deleteUser = unavailable;
