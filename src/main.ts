import { AppModule } from '@/app.module';
import { RedisIoAdapter } from '@/common/adapters/redis-io.adapter';
import { ConfigurationService } from '@/configuration/configuration.service';

import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  const adapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new GlobalExceptionFilter(adapterHost));

  const configService = app.get(ConfigurationService);
  const port = configService.get('PORT') ?? '3000';
  await app.listen(parseInt(port, 10));
}
void bootstrap();
