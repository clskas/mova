import { Module } from '@nestjs/common';
import { RentalAutoStartScheduler } from './rental-auto-start.scheduler';
import { RentalController } from './rental.controller';
import { RentalService } from './rental.service';

@Module({
  controllers: [RentalController],
  providers: [RentalService, RentalAutoStartScheduler],
  exports: [RentalService],
})
export class RentalModule {}
