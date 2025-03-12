import { AppModule } from '@/app.module';
import { RedisIoAdapter } from '@/common/adapters/redis-io.adapter';

import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new GlobalExceptionFilter(httpAdapter));

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
