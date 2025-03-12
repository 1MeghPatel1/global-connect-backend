import { ErrorUtil } from '@/common/utils/error.util';
import { PrismaService } from '@/database/prisma/prisma.service';
import { AuthProvider, User } from '@prisma/client';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

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
    @Inject('JWT_REFRESH_SECRET') private readonly refreshSecret: string,
  ) {}

  private generateTokens(payload: JwtPayload): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
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
    try {
      const { provider } = registerDto;

      const registrationMethods = {
        [AuthProvider.EMAIL]: () => this.registerWithEmail(registerDto),
        [AuthProvider.GOOGLE]: () => this.registerWithGoogle(registerDto),
        [AuthProvider.ANONYMOUS]: () => this.registerAnonymous(registerDto),
      };

      const registrationMethod = registrationMethods[provider];
      if (!registrationMethod) {
        throw new BadRequestException(
          `Unsupported provider: ${provider as string}`,
        );
      }

      return registrationMethod();
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.register');
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    try {
      const { provider } = loginDto;

      const loginMethods = {
        [AuthProvider.EMAIL]: () => this.loginWithEmail(loginDto),
        [AuthProvider.GOOGLE]: () => this.loginWithGoogle(loginDto),
        [AuthProvider.ANONYMOUS]: () => this.loginAnonymous(loginDto),
      };

      const loginMethod = loginMethods[provider];
      if (!loginMethod) {
        throw new BadRequestException(
          `Unsupported provider: ${provider as string}`,
        );
      }

      return loginMethod();
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.login');
    }
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

  private async registerWithEmail(
    registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    const { email, password, username } = registerDto;

    if (!email || !password) {
      throw new BadRequestException(
        'Email and password are required for email registration',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and account in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          username,
          isVerified: false,
          isAnonymous: false,
          gender: registerDto.gender || undefined,
          avatarUrl: registerDto.avatarUrl || undefined,
          online: true,
          lastActive: new Date(),
        },
      });

      // Create account
      await prisma.account.create({
        data: {
          userId: user.id,
          provider: AuthProvider.EMAIL,
          providerAccountId: email,
          passwordHash,
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

    const accessToken = this.jwtService.sign(payload);

    const { ...userWithoutPassword } = result.user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken: result.sessionToken,
    };
  }

  private async loginWithEmail(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    if (!email || !password) {
      throw new BadRequestException(
        'Email and password are required for email login',
      );
    }

    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Find account
    const account = await this.prisma.account.findFirst({
      where: {
        userId: user.id,
        provider: AuthProvider.EMAIL,
      },
    });

    if (!account || !account.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      account.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update user's online status
    await this.prisma.user.update({
      where: { id: user.id },
      data: { online: true },
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

    const accessToken = this.jwtService.sign(payload);

    const { ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken: sessionToken,
    };
  }

  private async registerWithGoogle(
    registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    const { accessToken } = registerDto;

    if (!accessToken) {
      throw new BadRequestException(
        'Access token is required for Google registration',
      );
    }

    try {
      // Verify Google token and get user info
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
        registerDto.username,
      );
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.registerWithGoogle');
    }
  }

  private async loginWithGoogle(loginDto: LoginDto): Promise<AuthResponse> {
    const { accessToken } = loginDto;

    if (!accessToken) {
      throw new BadRequestException(
        'Access token is required for Google login',
      );
    }

    try {
      // Verify Google token and get user info
      const googleUserInfo = await this.getGoogleUserInfo(accessToken);

      // Find account by Google ID
      const account = await this.prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: googleUserInfo.id,
          },
        },
        include: { user: true },
      });

      if (!account) {
        throw new UnauthorizedException(
          'No account found with this Google account',
        );
      }

      return this.handleExistingGoogleUser(account, accessToken);
    } catch (error) {
      ErrorUtil.handleError(error, 'AuthService.loginWithGoogle');
    }
  }

  private async registerAnonymous(
    registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    const { username } = registerDto;

    if (!username) {
      throw new BadRequestException(
        'Username is required for anonymous registration',
      );
    }

    // Create anonymous user
    const user = await this.prisma.user.create({
      data: {
        username,
        isAnonymous: true,
        isVerified: false,
        online: true,
        lastActive: new Date(),
        gender: registerDto.gender || undefined,
        avatarUrl: registerDto.avatarUrl || undefined,
      },
    });

    // Create anonymous account
    const anonymousId = uuidv4();
    await this.prisma.account.create({
      data: {
        userId: user.id,
        provider: AuthProvider.ANONYMOUS,
        providerAccountId: anonymousId,
      },
    });

    // Create session
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
      username: user.username,
      isAnonymous: true,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      user,
      accessToken,
      refreshToken: sessionToken,
    };
  }

  private async loginAnonymous(loginDto: LoginDto): Promise<AuthResponse> {
    // Find anonymous account
    const account = await this.prisma.account.findFirst({
      where: {
        providerAccountId: loginDto.accessToken, // Using accessToken as anonymous ID
        provider: AuthProvider.ANONYMOUS,
      },
      include: { user: true },
    });

    if (!account) {
      throw new BadRequestException(
        'Anonymous account not found. Please register first.',
      );
    }

    // Update user's online status and create session
    const sessionToken = uuidv4();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: account.user.id },
        data: { online: true },
      }),
      this.prisma.session.create({
        data: {
          userId: account.user.id,
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          sessionToken,
        },
      }),
    ]);

    const payload: JwtPayload = {
      sub: account.user.id,
      username: account.user.username,
      isAnonymous: true,
    };

    return {
      user: account.user,
      accessToken: this.jwtService.sign(payload),
      refreshToken: sessionToken,
    };
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

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.refreshSecret,
        },
      );

      // Check if refresh token exists in database
      const session = await this.prisma.session.findUnique({
        where: { sessionToken: refreshToken },
        include: { user: true },
      });

      if (!session || new Date() > session.expires) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Generate new tokens
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        this.generateTokens(payload);

      // Update session with new refresh token
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          sessionToken: newRefreshToken,
          expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return {
        user: session.user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
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
}
