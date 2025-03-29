import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { KarmaLevel } from '@prisma/client';

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { ChatCreditsService } from './chat-credits.service';

interface TransferCreditsDto {
  toUserId: string;
  amount: number;
  metadata?: Record<string, any>;
}

@Controller('chat-credits')
@UseGuards(JwtAuthGuard)
export class ChatCreditsController {
  constructor(private readonly chatCreditsService: ChatCreditsService) {}

  @Get()
  async getCredits(@CurrentUser() user: { id: string }) {
    return this.chatCreditsService.getOrCreateCredits(user.id);
  }

  @Get('history')
  async getTransactionHistory(@CurrentUser() user: { id: string }) {
    return this.chatCreditsService.getTransactionHistory(user.id);
  }

  @Post('daily')
  async claimDailyReward(
    @CurrentUser() user: { id: string; karmaLevel: KarmaLevel },
  ) {
    return this.chatCreditsService.awardDailyCredits(user.id, user.karmaLevel);
  }

  @Post('transfer')
  async transferCredits(
    @CurrentUser() user: { id: string },
    @Body() { toUserId, amount, metadata }: TransferCreditsDto,
  ) {
    return this.chatCreditsService.transferCredits(
      user.id,
      toUserId,
      amount,
      metadata,
    );
  }
}
