import { Request, Response } from 'express';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
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

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return await this.authService.refreshToken(refreshToken);
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

  @Get('oauth/google')
  @HttpCode(HttpStatus.OK)
  googleOAuthRedirect(@Res() res: Response): void {
    try {
      const redirectUrl = this.authService.getGoogleOAuthUrl();
      res.redirect(redirectUrl);
    } catch (_error) {
      throw new BadRequestException('Failed to redirect to Google OAuth');
    }
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
    return await this.authService.handleGoogleOAuthCallback(code);
  }
}
