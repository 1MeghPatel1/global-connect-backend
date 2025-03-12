import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { ChatGateway } from '@/chat/chat.gateway';
import { ConfigurationModule } from '@/configuration/configuration.module';
import { PrismaModule } from '@/database/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { UsersModule } from './users/users.module';

@Module({
  imports: [ConfigurationModule, AuthModule, PrismaModule, UsersModule],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}
