import { PrismaClient } from '@prisma/client';

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    Logger.log('Database connected successfully!', 'PrismaService');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    Logger.log('Database disconnected successfully!', 'PrismaService');
  }
}
