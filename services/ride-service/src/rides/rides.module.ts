import { Module } from '@nestjs/common';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { ScheduledRidesService } from './scheduled-rides.service';
import { PricingService } from './pricing.service';
import { MatchingModule } from '../matching/matching.module';
@Module({ imports: [MatchingModule], controllers: [RidesController], providers: [RidesService, ScheduledRidesService, PricingService], exports: [RidesService, ScheduledRidesService, PricingService] })
export class RidesModule {}
