import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { OtpModule } from './otp/otp.module';
import { SmsModule } from './sms/sms.module';
import { HubAuthModule } from './auth/hub-auth.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    HubAuthModule,
    OtpModule,
    SmsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
