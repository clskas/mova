import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, HealthModule, AuthModule, AdminModule] })
export class AppModule {}
