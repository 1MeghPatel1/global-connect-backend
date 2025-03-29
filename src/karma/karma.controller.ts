import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { KarmaActionType } from '@prisma/client';

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { KarmaService } from './karma.service';

interface KarmaActionDto {
  actionType: KarmaActionType;
  metadata?: Record<string, any>;
}

@Controller('karma')
@UseGuards(JwtAuthGuard)
export class KarmaController {
  constructor(private readonly karmaService: KarmaService) {}

  @Get()
  async getKarma(@CurrentUser() user: { id: string }) {
    return this.karmaService.getOrCreateKarma(user.id);
  }

  @Get('history')
  async getKarmaHistory(@CurrentUser() user: { id: string }) {
    return this.karmaService.getKarmaHistory(user.id);
  }

  @Post('action')
  async recordAction(
    @CurrentUser() user: { id: string },
    @Body() { actionType, metadata }: KarmaActionDto,
  ) {
    return this.karmaService.adjustKarma(user.id, actionType, metadata);
  }
}
