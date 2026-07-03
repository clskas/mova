import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailModule } from './email/email.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, NotificationsModule, EmailModule] })
export class AppModule {}
