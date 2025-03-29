import { PrismaService } from '@/database/prisma/prisma.service';
import { CreditTransactionType, KarmaLevel } from '@prisma/client';

import { Injectable, Logger } from '@nestjs/common';

interface ChatCreditsConfig {
  dailyReward: {
    base: number;
    karmaMultiplier: Record<KarmaLevel, number>;
  };
  bonusRewards: {
    positiveRating: number;
    referral: number;
    firstLoginOfDay: number;
  };
  messageCost: number;
  maxCredits: number;
  minTransferAmount: number;
}

@Injectable()
export class ChatCreditsService {
  private readonly logger = new Logger(ChatCreditsService.name);
  private readonly config: ChatCreditsConfig = {
    dailyReward: {
      base: 10,
      karmaMultiplier: {
        [KarmaLevel.BRONZE]: 1,
        [KarmaLevel.SILVER]: 1.2,
        [KarmaLevel.GOLD]: 1.5,
        [KarmaLevel.PLATINUM]: 2,
        [KarmaLevel.DIAMOND]: 3,
      },
    },
    bonusRewards: {
      positiveRating: 5,
      referral: 20,
      firstLoginOfDay: 5,
    },
    messageCost: 1,
    maxCredits: 1000,
    minTransferAmount: 5,
  };

  constructor(private prisma: PrismaService) {}

  async getOrCreateCredits(userId: string) {
    let credits = await this.prisma.chatCredits.findUnique({
      where: { userId },
      include: { transactions: true },
    });

    if (!credits) {
      credits = await this.prisma.chatCredits.create({
        data: {
          userId,
          balance: 0,
        },
        include: { transactions: true },
      });
    }

    return credits;
  }

  async addCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    metadata?: Record<string, any>,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const credits = await tx.chatCredits.upsert({
        where: { userId },
        create: {
          userId,
          balance: amount,
          lifetimeEarned: amount,
          transactions: {
            create: {
              type,
              amount,
              metadata: metadata || {},
            },
          },
        },
        update: {
          balance: { increment: amount },
          lifetimeEarned: { increment: amount },
          transactions: {
            create: {
              type,
              amount,
              metadata: metadata || {},
            },
          },
        },
      });

      return credits;
    });
  }

  async spendCredits(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    metadata?: Record<string, any>,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const credits = await tx.chatCredits.findUnique({
        where: { userId },
      });

      if (!credits || credits.balance < amount) {
        return null;
      }

      return await tx.chatCredits.update({
        where: { id: credits.id },
        data: {
          balance: { decrement: amount },
          lifetimeSpent: { increment: amount },
          transactions: {
            create: {
              type,
              amount: -amount,
              metadata: metadata || {},
            },
          },
        },
      });
    });
  }

  async transferCredits(
    fromUserId: string,
    toUserId: string,
    amount: number,
    metadata?: Record<string, any>,
  ) {
    if (amount < this.config.minTransferAmount) {
      return null;
    }

    return await this.prisma.$transaction(async (_tx) => {
      // Deduct from sender
      const fromResult = await this.spendCredits(
        fromUserId,
        amount,
        CreditTransactionType.DONATION_SENT,
        metadata,
      );

      if (!fromResult) {
        return null;
      }

      // Add to receiver
      await this.addCredits(
        toUserId,
        amount,
        CreditTransactionType.DONATION_RECEIVED,
        metadata,
      );

      return fromResult;
    });
  }

  async getTransactionHistory(userId: string) {
    return this.prisma.chatCreditTransaction.findMany({
      where: {
        credits: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        credits: true,
      },
    });
  }

  async awardDailyCredits(userId: string, karmaLevel: KarmaLevel) {
    const credits = await this.getOrCreateCredits(userId);

    // Check if already received daily reward today
    if (
      credits.lastDailyReward &&
      new Date(credits.lastDailyReward).toDateString() ===
        new Date().toDateString()
    ) {
      return null;
    }

    const baseAmount = this.config.dailyReward.base;
    const multiplier = this.config.dailyReward.karmaMultiplier[karmaLevel];
    const amount = Math.floor(baseAmount * multiplier);

    return await this.prisma.chatCredits.update({
      where: { id: credits.id },
      data: {
        balance: { increment: amount },
        lifetimeEarned: { increment: amount },
        lastDailyReward: new Date(),
        transactions: {
          create: {
            type: CreditTransactionType.DAILY_REWARD,
            amount,
            metadata: { karmaLevel },
          },
        },
      },
    });
  }
}
