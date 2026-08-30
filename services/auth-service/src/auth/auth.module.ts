import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '@mova/shared';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleTokenVerifier } from './google-id-token';
import { EmailOtpMailer } from './email-otp.mailer';
import {
  MockSmsProvider,
  AfriSoftSmsHubProvider,
  SerdiPaySmsProvider,
  AfricasTalkingSmsProvider,
  SmsService,
  TwilioSmsProvider,
} from './sms.providers';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config.get('JWT_SECRET')),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') ?? '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleTokenVerifier,
    EmailOtpMailer,
    JwtStrategy,
    MockSmsProvider,
    AfriSoftSmsHubProvider,
    SerdiPaySmsProvider,
    AfricasTalkingSmsProvider,
    TwilioSmsProvider,
    SmsService,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
