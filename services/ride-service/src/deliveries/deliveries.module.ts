import { Module } from '@nestjs/common';
import { ErrandsModule } from '../errands/errands.module';
import { TrackingModule } from '../tracking/tracking.module';
import { MatchingModule } from '../matching/matching.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { RidesModule } from '../rides/rides.module';

@Module({
  imports: [RidesModule, ErrandsModule, TrackingModule, MatchingModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
