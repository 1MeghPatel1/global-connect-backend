import { ErrorUtil } from '@/common/utils/error.util';
import { ConfigurationService } from '@/configuration/configuration.service';
import { PrismaService } from '@/database/prisma/prisma.service';
import { AuthProvider, User } from '@prisma/client';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { LibService } from '../lib/lib.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponse,
  GoogleUserInfo,
  JwtPayload,
} from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  private readonly ACCESS_TOKEN_EXPIRY = '10m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigurationService,
    private libService: LibService,
  ) {}

  private generateTokens(payload: JwtPayload): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });

    return { accessToken, refreshToken };
  }

  private async createAuthSession(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
      isAnonymous: user.isAnonymous,
    };

    const { accessToken, refreshToken } = this.generateTokens(payload);

    // Store refresh token in database
    await this.prisma.session.create({
      data: {
        userId: user.id,
        sessionToken: refreshToken,
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { accessToken, refreshToken };
  }

  // Helper method to update user's online status
  private async updateUserOnlineStatus(
    userId: string,
    isOnline: boolean,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        online: isOnline,
        lastActive: isOnline ? undefined : new Date(),
      },
    });
  }

  // Helper method to handle authentication response
  private async createAuthResponse(user: User): Promise<AuthResponse> {
    await this.updateUserOnlineStatus(user.id, true);
    const { accessToken, refreshToken } = await this.createAuthSession(user);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    if (!registerDto.password) {
      throw new BadRequestException('Password is required');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: registerDto.username,
        email: registerDto.email,
        age: registerDto.age,
        gender: registerDto.gender || 'PREFER_NOT_TO_SAY',
        city: registerDto.location,
        interests: registerDto.interests,
        accounts: {
          create: {
            provider: AuthProvider.EMAIL,
            providerAccountId: registerDto.email,
            passwordHash: hashedPassword,
          },
        },
      },
    });

    const token = await this.generateToken(user.id);
    const refreshToken = await this.generateRefreshToken(user.id);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        sessionToken: refreshToken,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      user,
      accessToken: token,
      refreshToken,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    if (!loginDto.password) {
      throw new BadRequestException('Password is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        accounts: {
          where: { provider: AuthProvider.EMAIL },
        },
      },
    });

    if (!user || !user.accounts.length || !user.accounts[0].passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.accounts[0].passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.generateToken(user.id);
    const refreshToken = await this.generateRefreshToken(user.id);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        sessionToken: refreshToken,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      user,
      accessToken: token,
      refreshToken,
    };
  }

  async logout(userId: string): Promise<boolean> {
    try {
      await Promise.all([
        this.updateUserOnlineStatus(userId, false),
        this.prisma.session.deleteMany({ where: { userId } }),
      ]);
      return true;
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.logout');
    }
  }

  async validateUser(payload: JwtPayload): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const { ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private async generateToken(userId: string): Promise<string> {
    return this.jwtService.signAsync({ sub: userId }, { expiresIn: '1h' });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId },
      { expiresIn: '30d', secret: this.config.get('JWT_REFRESH_SECRET') },
    );
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    const session = await this.prisma.session.findUnique({
      where: { sessionToken: refreshToken },
      include: { user: true },
    });

    if (!session || session.expires < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const token = await this.generateToken(session.user.id);
    const newRefreshToken = await this.generateRefreshToken(session.user.id);

    // Update session with new refresh token
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        sessionToken: newRefreshToken,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return {
      user: session.user,
      accessToken: token,
      refreshToken: newRefreshToken,
    };
  }

  async revokeRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      await this.prisma.session.delete({
        where: { sessionToken: refreshToken },
      });
      return true;
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.revokeRefreshToken');
    }
  }

  async handleGoogleOAuthCallback(code: string): Promise<AuthResponse> {
    try {
      const oauth2Client = this.libService.getGoogleOAuth2Client();
      if (!oauth2Client) {
        throw new Error('Failed to initialize OAuth2 client');
      }

      const tokenResponse = await oauth2Client.getToken(code);
      if (!tokenResponse.tokens) {
        throw new Error('Failed to get tokens from OAuth2 response');
      }

      const accessToken = tokenResponse.tokens.access_token;
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      oauth2Client.setCredentials(tokenResponse.tokens);
      const googleUserInfo = await this.getGoogleUserInfo(accessToken);

      // Check if user already exists
      const existingAccount = await this.prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: googleUserInfo.id,
          },
        },
        include: { user: true },
      });

      if (existingAccount) {
        // User exists, return login response
        return this.handleExistingGoogleUser(existingAccount, accessToken);
      }

      // Check if email is already used
      if (googleUserInfo.email) {
        const existingUser = await this.prisma.user.findUnique({
          where: { email: googleUserInfo.email },
        });

        if (existingUser) {
          // Link Google account to existing user
          return this.linkGoogleToExistingUser(
            existingUser,
            googleUserInfo,
            accessToken,
          );
        }
      }

      // Create new user with Google account
      return this.createNewGoogleUser(
        googleUserInfo,
        accessToken,
        googleUserInfo.name,
      );
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.handleGoogleOAuthCallback');
    }
  }

  getGoogleOAuthUrl(): string {
    try {
      const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
      const options = {
        redirect_uri: this.config.get('GOOGLE_REDIRECT_URI'),
        client_id: this.config.get('GOOGLE_CLIENT_ID'),
        access_type: 'offline',
        response_type: 'code',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
        ].join(' '),
      };

      const qs = new URLSearchParams(options);
      return `${rootUrl}?${qs.toString()}`;
    } catch (_error) {
      throw new Error('Failed to generate Google OAuth URL');
    }
  }

  private async getGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    try {
      const response = await axios.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.data as GoogleUserInfo;
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.getGoogleUserInfo');
    }
  }

  private async handleExistingGoogleUser(
    account: {
      id: string;
      user: User;
    },
    accessToken: string,
  ): Promise<AuthResponse> {
    // Update token information
    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken,
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      },
    });

    // Update user's online status
    await this.prisma.user.update({
      where: { id: account.user.id },
      data: { online: true },
    });

    // Create new session
    const sessionToken = uuidv4();
    await this.prisma.session.create({
      data: {
        userId: account.user.id,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        sessionToken,
      },
    });

    // Generate JWT token
    const payload: JwtPayload = {
      sub: account.user.id,
      email: account.user.email || undefined,
      username: account.user.username,
      isAnonymous: account.user.isAnonymous,
    };

    const jwtToken = this.jwtService.sign(payload);

    return {
      user: account.user,
      accessToken: jwtToken,
      refreshToken: sessionToken,
    };
  }

  private async linkGoogleToExistingUser(
    user: User,
    googleUserInfo: GoogleUserInfo,
    accessToken: string,
  ): Promise<AuthResponse> {
    // Create Google account linked to existing user
    await this.prisma.account.create({
      data: {
        userId: user.id,
        provider: AuthProvider.GOOGLE,
        providerAccountId: googleUserInfo.id,
        accessToken,
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      },
    });

    // Update user's online status
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        online: true,
        isVerified: true, // Mark as verified since Google accounts are verified
      },
    });

    // Create new session
    const sessionToken = uuidv4();
    await this.prisma.session.create({
      data: {
        userId: user.id,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        sessionToken,
      },
    });

    // Generate JWT token
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
      isAnonymous: user.isAnonymous,
    };

    const jwtToken = this.jwtService.sign(payload);

    return {
      user,
      accessToken: jwtToken,
      refreshToken: sessionToken,
    };
  }

  private async createNewGoogleUser(
    googleUserInfo: GoogleUserInfo,
    accessToken: string,
    providedUsername?: string,
  ): Promise<AuthResponse> {
    // Create user and account in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Generate username if not provided
      const username =
        providedUsername ||
        googleUserInfo.name ||
        googleUserInfo.given_name ||
        `user_${Math.random().toString(36).substring(2, 10)}`;

      // Create user
      const user = await prisma.user.create({
        data: {
          email: googleUserInfo.email,
          username,
          isVerified: googleUserInfo.verified_email,
          isAnonymous: false,
          online: true,
          lastActive: new Date(),
          avatarUrl: googleUserInfo.picture,
          gender: 'PREFER_NOT_TO_SAY',
        },
      });

      // Create account
      await prisma.account.create({
        data: {
          userId: user.id,
          provider: AuthProvider.GOOGLE,
          providerAccountId: googleUserInfo.id,
          accessToken,
          expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        },
      });

      // Create session
      const sessionToken = uuidv4();
      await prisma.session.create({
        data: {
          userId: user.id,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          sessionToken,
        },
      });

      return { user, sessionToken };
    });

    // Generate JWT token
    const payload: JwtPayload = {
      sub: result.user.id,
      email: result.user.email || undefined,
      username: result.user.username,
      isAnonymous: result.user.isAnonymous,
    };

    const jwtToken = this.jwtService.sign(payload);

    return {
      user: result.user,
      accessToken: jwtToken,
      refreshToken: result.sessionToken,
    };
  }
}
