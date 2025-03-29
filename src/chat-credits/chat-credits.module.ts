import { Module } from '@nestjs/common';

import { ChatCreditsController } from './chat-credits.controller';
import { ChatCreditsService } from './chat-credits.service';

@Module({
  controllers: [ChatCreditsController],
  providers: [ChatCreditsService],
  exports: [ChatCreditsService],
})
export class ChatCreditsModule {}
