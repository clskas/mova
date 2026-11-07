import { Module } from '@nestjs/common';
import { MoneyControlService } from './money-control.service';
import { MoneyControlScheduler } from './money-control.scheduler';

@Module({
  providers: [MoneyControlService, MoneyControlScheduler],
  exports: [MoneyControlService],
})
export class MoneyControlModule {}
