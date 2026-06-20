import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { ScheduledRidesService } from './scheduled-rides.service';
import { RideSearchScheduler } from './ride-search.scheduler';
import { PricingService } from './pricing.service';
import { PricingAdminService } from './pricing-admin.service';
import { CommissionService } from './commission.service';
import { SurchargeService, PromoService } from './surcharge.service';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ShareModule } from '../share/share.module';
import { TripShareService } from '../share/trip-share.service';

@Module({
  imports: [MatchingModule, WebsocketModule, TrackingModule, ShareModule],
  controllers: [RidesController],
  providers: [RidesService, ScheduledRidesService, RideSearchScheduler, PricingService, PricingAdminService, CommissionService, SurchargeService, PromoService],
  exports: [RidesService, ScheduledRidesService, PricingService, PricingAdminService, CommissionService, SurchargeService, PromoService, TripShareService],
})
export class RidesModule {}
