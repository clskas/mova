import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule, RequestIdMiddleware } from '@mova/shared';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { RidesModule } from './rides/rides.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { ServicesCatalogModule } from './services-catalog/services-catalog.module';
import { CarpoolModule } from './carpool/carpool.module';
import { ErrandsModule } from './errands/errands.module';
import { RentalModule } from './rental/rental.module';
import { GeoModule } from './geo/geo.module';
import { RatingsModule } from './ratings/ratings.module';
import { MatchingModule } from './matching/matching.module';
import { WebsocketModule } from './websocket/websocket.module';
import { InternalModule } from './internal/internal.module';
import { AuthModule } from './auth/auth.module';
import { HistoryModule } from './history/history.module';
import { MovingModule } from './moving/moving.module';
import { ExpressModule } from './express/express.module';
import { UploadsModule } from './uploads/uploads.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { RentalPartnerModule } from './rental-partner/rental-partner.module';
import { TrackingModule } from './tracking/tracking.module';
import { PublicModule } from './public/public.module';
import { PromoModule } from './promo/promo.module';
import { BillingModule } from './billing/billing.module';
import { PublicitesModule } from './publicites/publicites.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), RedisModule, PrismaModule, HealthModule, AuthModule, RidesModule, DeliveriesModule, ServicesCatalogModule, CarpoolModule, ErrandsModule, RentalModule, GeoModule, RatingsModule, MatchingModule, WebsocketModule, InternalModule, HistoryModule, MovingModule, ExpressModule, UploadsModule, RestaurantModule, RentalPartnerModule, TrackingModule, PublicModule, PromoModule, BillingModule, PublicitesModule] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
