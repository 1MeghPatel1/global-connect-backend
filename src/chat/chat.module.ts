import { WsJwtAuthGuard } from '@/auth/guards/ws-jwt-auth.guard';
import { ConfigurationModule } from '@/configuration/configuration.module';
import { UsersModule } from '@/users/users.module';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    ConfigurationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ChatGateway, ChatService, WsJwtAuthGuard],
  exports: [ChatService],
})
export class ChatModule {}
