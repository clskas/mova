import { Module } from '@nestjs/common';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { DriverHistoryService } from './driver-history.service';
import { CommissionService } from '../rides/commission.service';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService, DriverHistoryService, CommissionService],
  exports: [HistoryService],
})
export class HistoryModule {}
