import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { DriversModule } from './drivers/drivers.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InternalModule } from './internal/internal.module';
import { AuthModule } from './auth/auth.module';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, DriversModule, IncidentsModule, InternalModule],
})
export class AppModule {}
