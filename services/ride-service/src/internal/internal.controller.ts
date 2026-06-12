import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InternalApiGuard } from '../common/internal-api.guard';
import { RidesService } from '../rides/rides.service';
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private rides: RidesService) {}
  @Get('rides/:id') getRide(@Param('id') id: string) { return this.rides.getRide(id); }
  @Get('rides/driver/:userId/earnings') earnings(@Param('userId') userId: string) { return this.rides.getDriverEarnings(userId); }
  @Get('rides/stats') stats() { return this.rides.getStats(); }
}
