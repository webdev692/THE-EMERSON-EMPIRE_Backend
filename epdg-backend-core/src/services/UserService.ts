import { User } from '../models/User';

export class UserService {
  async getAllUsers(): Promise<User[]> {
    return [];
  }

  async getUserById(_id: string): Promise<User | null> {
    return null;
  }

  async createUser(_userData: any): Promise<User> {
    const newUser: User = {
      id: 1,
      email: '',
      name: '',
      password: '',
      role: 'intern',
      is_verified: false,
      verification_token: null,
      token_expires_at: null,
      last_login_at: null,
      created_at: new Date(),
      deleted_at: null,
    };
    return newUser;
  }

  async updateUser(_id: string, _userData: Partial<User>): Promise<User | null> {
    return null;
  }

  async deleteUser(_id: string): Promise<boolean> {
    return true;
  }
}
