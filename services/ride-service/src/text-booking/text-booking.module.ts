import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { RidesModule } from '../rides/rides.module';
import { TextBookingController } from './text-booking.controller';
import { TextBookingService } from './text-booking.service';

@Module({
  imports: [GeoModule, RidesModule],
  controllers: [TextBookingController],
  providers: [TextBookingService],
})
export class TextBookingModule {}
