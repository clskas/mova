import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingModule } from '../tracking/tracking.module';
import { PartnerPortalEventsService } from './partner-portal-events.service';
import { RestaurantPortalEventsService } from './restaurant-portal-events.service';
import { TrackingGateway } from './tracking.gateway';

@Module({
  imports: [TrackingModule, AuthModule, PrismaModule],
  providers: [TrackingGateway, PartnerPortalEventsService, RestaurantPortalEventsService],
  exports: [TrackingGateway],
})
export class WebsocketModule {}
