import { Module } from '@nestjs/common';

import { KarmaController } from './karma.controller';
import { KarmaService } from './karma.service';

@Module({
  controllers: [KarmaController],
  providers: [KarmaService],
  exports: [KarmaService],
})
export class KarmaModule {}
