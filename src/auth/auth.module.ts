import { PrismaModule } from '@/database/prisma/prisma.module';
import { LibModule } from '@/lib/lib.module';
import { UsersModule } from '@/users/users.module';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'super-secret-key',
        signOptions: {
          expiresIn: '10m', // Access token expires in 10 minutes
        },
      }),
    }),
    LibModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    {
      provide: 'JWT_REFRESH_SECRET',
      useFactory: (configService: ConfigService) =>
        configService.get<string>('JWT_REFRESH_SECRET') ||
        'super-refresh-secret-key',
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
