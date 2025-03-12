import { User } from '@prisma/client';
import { Request } from 'express';

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  accessToken: string;
  refreshToken?: string;
}

export interface JwtPayload {
  sub: string; // userId
  email?: string;
  username: string;
  isAnonymous: boolean;
  iat?: number;
  exp?: number;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}

// Add this interface for reuse
export interface RequestWithUser extends Request {
  user: JwtPayload & Partial<User>;
}
