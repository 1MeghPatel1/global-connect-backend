import { PrismaService } from '@/database/prisma/prisma.service';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';

import { Injectable, NotFoundException } from '@nestjs/common';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  tier: SubscriptionTier;
}

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Basic features for getting started',
    price: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      'Limited chat credits',
      'Basic matching',
      'Filter by gender 3 times per day',
      'Standard karma benefits',
    ],
    tier: SubscriptionTier.FREE,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Advanced features for power users',
    price: 9.99,
    currency: 'USD',
    billingCycle: 'monthly',
    features: [
      'Unlimited chat credits',
      'Donate up to 250 credits daily',
      'Exclusive karma badge',
      'Unlimited gender-based filtering',
      'Priority matching',
      'Advanced features',
    ],
    tier: SubscriptionTier.PREMIUM,
  },
];

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  getPlans(): SubscriptionPlan[] {
    return SUBSCRIPTION_PLANS;
  }

  async getUserSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!subscription) {
      return {
        tier: SubscriptionTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate: null,
        autoRenew: false,
      };
    }

    return subscription;
  }

  async subscribe(userId: string, planId: string) {
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    // Cancel any active subscriptions
    await this.prisma.subscription.updateMany({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.CANCELED },
    });

    // Create new subscription
    return await this.prisma.subscription.create({
      data: {
        userId,
        tier: plan.tier,
        status: SubscriptionStatus.ACTIVE,
        startDate: new Date(),
        endDate: null,
        autoRenew: true,
        payments: {
          create: {
            amount: plan.price,
            currency: plan.currency,
            status: 'COMPLETED',
          },
        },
      },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async cancel(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
    });

    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    return await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        endDate: new Date(),
        autoRenew: false,
      },
    });
  }

  async isUserPro(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        tier: SubscriptionTier.PREMIUM,
      },
    });

    return !!subscription;
  }
}
