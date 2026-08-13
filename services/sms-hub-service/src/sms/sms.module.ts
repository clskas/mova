import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller';
import { ProviderService } from './provider.service';
import { HubAuthModule } from '../auth/hub-auth.module';

@Module({
  imports: [HubAuthModule],
  controllers: [SmsController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class SmsModule {}
