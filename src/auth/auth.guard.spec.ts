import { Request } from 'express';

import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/auth.interface';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwtService: JwtService;
  let authService: AuthService;

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    username: 'testuser',
    createdAt: new Date(),
    updatedAt: new Date(),
    isAnonymous: false,
    isVerified: false,
    age: null,
    gender: 'PREFER_NOT_TO_SAY' as const,
    city: null,
    state: null,
    country: null,
    interests: [],
    online: false,
    lastActive: null,
    avatarUrl: null,
  };

  const mockPayload: JwtPayload = {
    sub: '1',
    email: 'test@example.com',
    username: 'testuser',
    isAnonymous: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    jwtService = module.get<JwtService>(JwtService);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: {
      headers: { authorization?: string };
      user?: JwtPayload & Partial<typeof mockUser>;
    };

    beforeEach(() => {
      mockRequest = {
        headers: {
          authorization: 'Bearer valid_token',
        },
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;
    });

    it('should allow access with valid token', async () => {
      jest.spyOn(jwtService, 'verifyAsync').mockResolvedValue(mockPayload);
      jest.spyOn(authService, 'validateUser').mockResolvedValue(mockUser);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toBeDefined();
      expect((mockRequest.user as JwtPayload).sub).toBe(mockPayload.sub);
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      mockRequest.headers.authorization = undefined;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Authentication token is missing',
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const error = new Error();
      error.name = 'TokenExpiredError';
      jest.spyOn(jwtService, 'verifyAsync').mockRejectedValue(error);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Access token has expired',
      );
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      jest.spyOn(jwtService, 'verifyAsync').mockRejectedValue(new Error());

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid authentication token',
      );
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer authorization header', () => {
      const request = {
        headers: {
          authorization: 'Bearer test_token',
        },
      } as Request;

      const token = guard['extractTokenFromHeader'](request);
      expect(token).toBe('test_token');
    });

    it('should return undefined for non-Bearer authorization', () => {
      const request = {
        headers: {
          authorization: 'Basic test_token',
        },
      } as Request;

      const token = guard['extractTokenFromHeader'](request);
      expect(token).toBeUndefined();
    });

    it('should return undefined when authorization header is missing', () => {
      const request = {
        headers: {},
      } as Request;

      const token = guard['extractTokenFromHeader'](request);
      expect(token).toBeUndefined();
    });
  });
});
