import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

interface SubscribeDto {
  planId: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('status')
  async getStatus(@CurrentUser() user: { id: string }) {
    return this.subscriptionsService.getUserSubscription(user.id);
  }

  @Post('subscribe')
  async subscribe(
    @CurrentUser() user: { id: string },
    @Body() { planId }: SubscribeDto,
  ) {
    return this.subscriptionsService.subscribe(user.id, planId);
  }

  @Post('cancel')
  async cancel(@CurrentUser() user: { id: string }) {
    return this.subscriptionsService.cancel(user.id);
  }
}
