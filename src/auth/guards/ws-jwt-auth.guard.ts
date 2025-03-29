import { ConfigurationService } from '@/configuration/configuration.service';
import { PrismaService } from '@/database/prisma/prisma.service';
import { Socket } from 'socket.io';

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';

import { JwtPayload } from '../interfaces/auth.interface';

interface SocketData {
  id: string;
  username: string;
  email: string | null;
  isAnonymous: boolean;
  isVerified: boolean;
  online: boolean;
  lastActive: Date | null;
  avatarUrl: string | null;
}

interface SocketWithAuth extends Socket {
  data: {
    user: SocketData;
  };
  handshake: {
    auth?: {
      token?: string;
    };
    headers: {
      authorization?: string;
    };
  } & Socket['handshake'];
}

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private config: ConfigurationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient<SocketWithAuth>();
      const token = this.extractTokenFromHeader(client);

      if (!token) {
        throw new WsException('Unauthorized');
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          username: true,
          email: true,
          isAnonymous: true,
          isVerified: true,
          online: true,
          lastActive: true,
          avatarUrl: true,
        },
      });

      if (!user) {
        throw new WsException('User not found');
      }

      client.data.user = user as SocketData;

      return true;
    } catch (_error) {
      throw new WsException('Unauthorized');
    }
  }

  private extractTokenFromHeader(client: SocketWithAuth): string | undefined {
    const authToken = client.handshake.auth?.token;
    const authHeader = client.handshake.headers?.authorization;
    const auth = authToken || authHeader;

    if (!auth || typeof auth !== 'string') {
      return undefined;
    }

    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
