export interface User {
  id: number;
  email: string;
  name: string;
  password: string;
  role: 'admin' | 'company' | 'intern' | 'school';
  is_verified: boolean;
  verification_token: string | null;
  token_expires_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  deleted_at: Date | null;
}
