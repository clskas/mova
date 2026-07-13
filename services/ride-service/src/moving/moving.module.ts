import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { MovingController } from './moving.controller';
import { MovingService } from './moving.service';
import { MovingVehiclePricingService } from './moving-vehicle-pricing.service';

@Module({
  imports: [RidesModule],
  controllers: [MovingController],
  providers: [MovingService, MovingVehiclePricingService],
  exports: [MovingService, MovingVehiclePricingService],
})
export class MovingModule {}
