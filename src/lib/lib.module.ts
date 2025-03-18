import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LibService } from './lib.service';

@Module({
  imports: [ConfigModule],
  providers: [LibService],
  exports: [LibService],
})
export class LibModule {}
