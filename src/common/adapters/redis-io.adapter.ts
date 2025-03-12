/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigurationService } from '@/configuration/configuration.service';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

import { INestApplication, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

export class RedisIoAdapter extends IoAdapter {
  constructor(private app: INestApplication) {
    super(app);
  }
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const configService = this.app.get(ConfigurationService);
    const isDocker = configService.get('DOCKER') === '1';
    const pubClient = createClient({
      url: configService.get(isDocker ? 'REDIS_URL_DOCKER' : 'REDIS_URL'),
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    Logger.log(`Redis adapter connected`, 'RedisIoAdapter');
    return server;
  }
}
