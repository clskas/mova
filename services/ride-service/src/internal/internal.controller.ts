import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../common/internal-api.guard';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ScheduledRidesService } from '../rides/scheduled-rides.service';
import { RidesService } from '../rides/rides.service';

@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private rides: RidesService,
    private deliveries: DeliveriesService,
    private scheduledRides: ScheduledRidesService,
  ) {}

  @Get('rides/:id')
  getRide(@Param('id') id: string) {
    return this.rides.getRide(id);
  }

  @Get('rides/driver/:userId/earnings')
  earnings(@Param('userId') userId: string) {
    return this.rides.getDriverEarnings(userId);
  }

  @Get('rides/stats')
  stats() {
    return this.rides.getStats();
  }

  @Get('deliveries')
  listDeliveries(@Query('take') take?: string) {
    return this.deliveries.listForAdmin(Number(take ?? 50));
  }

  @Get('scheduled-rides')
  listScheduled(@Query('take') take?: string) {
    return this.scheduledRides.listForAdmin(Number(take ?? 50));
  }
}
