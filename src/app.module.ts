import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AuthModule } from '@/auth/auth.module';
import { ChatModule } from '@/chat/chat.module';
import { ConfigurationModule } from '@/configuration/configuration.module';
import { PrismaModule } from '@/database/prisma/prisma.module';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChatCreditsModule } from './chat-credits/chat-credits.module';
import { KarmaModule } from './karma/karma.module';
import { LibModule } from './lib/lib.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ConfigurationModule,
    AuthModule,
    PrismaModule,
    UsersModule,
    ChatModule,
    LibModule,
    KarmaModule,
    ChatCreditsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
