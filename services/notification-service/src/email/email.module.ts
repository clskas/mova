import { Module } from '@nestjs/common';
import { EmailInternalController } from './email-internal.controller';
import { EmailService } from './email.service';

@Module({
  controllers: [EmailInternalController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
