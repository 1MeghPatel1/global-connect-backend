import { AuthProvider, Gender, User } from '@prisma/client';

// Auth Response Types
declare global {
  namespace Auth {
    // JWT Payload
    interface JwtPayload {
      sub: string;
      email?: string;
      username: string;
      isAnonymous: boolean;
      iat?: number;
      exp?: number;
    }

    // Auth Response
    interface AuthResponse {
      user: User;
      accessToken: string;
      refreshToken: string;
    }

    // Request with User
    interface RequestWithUser extends Request {
      user?: JwtPayload;
    }

    // Google User Info
    interface GoogleUserInfo {
      id: string;
      email: string;
      verified_email: boolean;
      name: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      locale?: string;
    }

    // Base DTOs
    interface BaseLoginDto {
      provider: AuthProvider;
    }

    interface BaseRegisterDto {
      username: string;
      provider: AuthProvider;
      gender?: Gender;
      avatarUrl?: string;
    }

    // Provider-specific DTOs
    interface EmailLoginDto extends BaseLoginDto {
      email: string;
      password: string;
    }

    interface GoogleLoginDto extends BaseLoginDto {
      googleId: string;
      googleAccessToken: string;
    }

    interface AnonymousLoginDto extends BaseLoginDto {
      accessToken: string;
    }

    interface EmailRegisterDto extends BaseRegisterDto {
      email: string;
      password: string;
    }

    interface GoogleRegisterDto extends BaseRegisterDto {
      googleId: string;
      googleAccessToken: string;
      googleRefreshToken?: string;
      googleProfilePicture?: string;
    }

    interface AnonymousRegisterDto extends BaseRegisterDto {
      isAnonymous: true;
    }
  }
}

export {};
