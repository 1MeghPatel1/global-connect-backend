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

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
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
}
