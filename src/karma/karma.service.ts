import { PrismaService } from '@/database/prisma/prisma.service';
import { KarmaActionType, KarmaLevel } from '@prisma/client';

import { Injectable, Logger } from '@nestjs/common';

interface KarmaConfig {
  levels: {
    [key in KarmaLevel]: {
      minPoints: number;
      maxPoints: number;
    };
  };
  actions: {
    [key in KarmaActionType]: {
      points: number;
      cooldown?: number; // in seconds
    };
  };
}

@Injectable()
export class KarmaService {
  private readonly logger = new Logger(KarmaService.name);
  private readonly config: KarmaConfig = {
    levels: {
      BRONZE: { minPoints: 0, maxPoints: 99 },
      SILVER: { minPoints: 100, maxPoints: 299 },
      GOLD: { minPoints: 300, maxPoints: 599 },
      PLATINUM: { minPoints: 600, maxPoints: 999 },
      DIAMOND: { minPoints: 1000, maxPoints: Infinity },
    },
    actions: {
      CHAT_DURATION: { points: 1, cooldown: 300 }, // 5 minutes
      SKIP: { points: -5 },
      POSITIVE_RATING: { points: 10 },
      NEGATIVE_RATING: { points: -10 },
      REPORT: { points: -20 },
      BLOCK: { points: -30 },
      DONATION: { points: 5 }, // per transaction
    },
  };

  constructor(private prisma: PrismaService) {}

  private calculateKarmaLevel(points: number): KarmaLevel {
    for (const [level, range] of Object.entries(this.config.levels)) {
      if (points >= range.minPoints && points <= range.maxPoints) {
        return level as KarmaLevel;
      }
    }
    return 'BRONZE';
  }

  async getOrCreateKarma(userId: string) {
    let karma = await this.prisma.karma.findUnique({
      where: { userId },
      include: { history: true },
    });

    if (!karma) {
      karma = await this.prisma.karma.create({
        data: {
          userId,
          level: 'BRONZE',
          points: 0,
        },
        include: { history: true },
      });
    }

    return karma;
  }

  async adjustKarma(
    userId: string,
    actionType: KarmaActionType,
    metadata?: Record<string, any>,
  ) {
    const points = this.config.actions[actionType].points;
    const cooldown = this.config.actions[actionType].cooldown;

    return await this.prisma.$transaction(async (tx) => {
      // Check cooldown if applicable
      if (cooldown) {
        const lastAction = await tx.karmaHistory.findFirst({
          where: {
            karma: { userId },
            actionType,
            createdAt: {
              gte: new Date(Date.now() - cooldown * 1000),
            },
          },
        });

        if (lastAction) {
          return null; // Still in cooldown
        }
      }

      // Get or create karma record
      const karma = await tx.karma.upsert({
        where: { userId },
        create: {
          userId,
          level: 'BRONZE',
          points: points,
          history: {
            create: {
              actionType,
              points,
              metadata: metadata || {},
            },
          },
        },
        update: {
          points: { increment: points },
          history: {
            create: {
              actionType,
              points,
              metadata: metadata || {},
            },
          },
        },
      });

      // Update karma level if needed
      const newLevel = this.calculateKarmaLevel(karma.points);
      if (newLevel !== karma.level) {
        await tx.karma.update({
          where: { id: karma.id },
          data: { level: newLevel },
        });
      }

      return {
        ...karma,
        level: newLevel,
      };
    });
  }

  async getKarmaHistory(userId: string) {
    return this.prisma.karmaHistory.findMany({
      where: {
        karma: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        karma: true,
      },
    });
  }
}
