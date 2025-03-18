import { Request } from 'express';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse } from './interfaces/auth.interface';
import { RequestWithUser } from './interfaces/auth.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/email')
  @HttpCode(HttpStatus.CREATED)
  async registerWithEmail(
    @Body() registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    return this.authService.registerWithEmail(registerDto);
  }

  @Post('register/google')
  @HttpCode(HttpStatus.CREATED)
  async registerWithGoogle(
    @Body() registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    return this.authService.registerWithGoogle(registerDto);
  }

  @Post('register/anonymous')
  @HttpCode(HttpStatus.CREATED)
  async registerAnonymous(
    @Body() registerDto: RegisterDto,
  ): Promise<AuthResponse> {
    return this.authService.registerAnonymous(registerDto);
  }

  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.loginWithEmail(loginDto);
  }

  @Post('login/google')
  @HttpCode(HttpStatus.OK)
  async loginWithGoogle(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.loginWithGoogle(loginDto);
  }

  @Post('login/anonymous')
  @HttpCode(HttpStatus.OK)
  async loginAnonymous(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.loginAnonymous(loginDto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: RequestWithUser): Promise<{ success: boolean }> {
    const userId = req.user?.sub;

    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    const success = await this.authService.logout(userId);
    return { success };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() body: { refreshToken: string },
  ): Promise<AuthResponse> {
    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    return this.authService.refreshToken(body.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  getProfile(@Req() req: RequestWithUser) {
    return req.user;
  }

  @Post('revoke')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeToken(
    @Body() body: { refreshToken: string },
  ): Promise<{ success: boolean }> {
    if (!body.refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const success = await this.authService.revokeRefreshToken(
      body.refreshToken,
    );
    return { success };
  }

  @Get('oauth/google/callback')
  @HttpCode(HttpStatus.OK)
  async googleOAuthCallback(
    @Req() req: Request<unknown, unknown, unknown, { code?: string }>,
  ): Promise<AuthResponse> {
    const { code } = req.query;
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }
    return this.authService.handleGoogleOAuthCallback(code);
  }
}
