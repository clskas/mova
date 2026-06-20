import { Module } from '@nestjs/common';
import { TripShareService } from './trip-share.service';

@Module({
  providers: [TripShareService],
  exports: [TripShareService],
})
export class ShareModule {}
