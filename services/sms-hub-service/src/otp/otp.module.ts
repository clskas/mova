import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';
import { ProviderService } from '../sms/provider.service';
import { HubAuthModule } from '../auth/hub-auth.module';

@Module({
  imports: [HubAuthModule],
  controllers: [OtpController],
  providers: [OtpService, ProviderService],
  exports: [OtpService],
})
export class OtpModule {}
