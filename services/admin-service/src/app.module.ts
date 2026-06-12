import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, AuthModule, AdminModule] })
export class AppModule {}
