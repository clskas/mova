import { Module } from '@nestjs/common';
import { SmileIdService } from './smile-id.service';
import { SmileIdWebhookController } from './smile-id.controller';

@Module({
  controllers: [SmileIdWebhookController],
  providers: [SmileIdService],
  exports: [SmileIdService],
})
export class SmileIdModule {}
