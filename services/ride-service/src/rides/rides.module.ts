import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidePoolController } from './ride-pool.controller';
import { RidesService } from './rides.service';
import { RidePoolService } from './ride-pool.service';
import { ScheduledRidesService } from './scheduled-rides.service';
import { RideSearchScheduler } from './ride-search.scheduler';
import { ScheduledRidesScheduler } from './scheduled-rides.scheduler';
import { PricingService } from './pricing.service';
import { PricingTimeWindowService } from './pricing-time-window.service';
import { PricingAdminService } from './pricing-admin.service';
import { CommissionService } from './commission.service';
import { SurchargeService, PromoService } from './surcharge.service';
import { MatchingModule } from '../matching/matching.module';
import { TrackingModule } from '../tracking/tracking.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { ShareModule } from '../share/share.module';
import { RideChatService } from '../chat/ride-chat.service';
import { FraudService } from '../fraud/fraud.service';
import { GeoModule } from '../geo/geo.module';

@Module({
  imports: [MatchingModule, WebsocketModule, TrackingModule, ShareModule, GeoModule],
  controllers: [RidesController, RidePoolController],
  providers: [RidesService, RidePoolService, ScheduledRidesService, RideSearchScheduler, ScheduledRidesScheduler, PricingService, PricingTimeWindowService, PricingAdminService, CommissionService, SurchargeService, PromoService, RideChatService, FraudService],
  exports: [RidesService, RidePoolService, ScheduledRidesService, PricingService, PricingTimeWindowService, PricingAdminService, CommissionService, SurchargeService, PromoService, ShareModule, FraudService, RideChatService, GeoModule],
})
export class RidesModule {}
