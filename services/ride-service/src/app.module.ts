import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { RidesModule } from './rides/rides.module';
import { GeoModule } from './geo/geo.module';
import { RatingsModule } from './ratings/ratings.module';
import { MatchingModule } from './matching/matching.module';
import { WebsocketModule } from './websocket/websocket.module';
import { InternalModule } from './internal/internal.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, RidesModule, GeoModule, RatingsModule, MatchingModule, WebsocketModule, InternalModule] })
export class AppModule {}
