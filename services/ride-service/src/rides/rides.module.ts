import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { ScheduledRidesService } from './scheduled-rides.service';
import { PricingService } from './pricing.service';
import { PricingAdminService } from './pricing-admin.service';
import { SurchargeService, PromoService } from './surcharge.service';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [MatchingModule],
  controllers: [RidesController],
  providers: [RidesService, ScheduledRidesService, PricingService, PricingAdminService, SurchargeService, PromoService],
  exports: [RidesService, ScheduledRidesService, PricingService, PricingAdminService, SurchargeService, PromoService],
})
export class RidesModule {}
