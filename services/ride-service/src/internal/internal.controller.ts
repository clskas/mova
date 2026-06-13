import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { InternalApiGuard } from '../common/internal-api.guard';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PaymentInfoService } from './payment-info.service';
import { PricingAdminService } from '../rides/pricing-admin.service';
import { ScheduledRidesService } from '../rides/scheduled-rides.service';
import { RidesService } from '../rides/rides.service';

@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private rides: RidesService,
    private deliveries: DeliveriesService,
    private scheduledRides: ScheduledRidesService,
    private pricingAdmin: PricingAdminService,
    private paymentInfo: PaymentInfoService,
  ) {}

  @Get('services/:referenceType/:referenceId/payment-info')
  getPaymentInfo(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.paymentInfo.getPaymentInfo(referenceType, referenceId);
  }

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

  @Get('restaurants')
  listRestaurants() {
    return this.deliveries.listRestaurantsAdmin();
  }

  @Post('restaurants')
  createRestaurant(@Body() body: Record<string, unknown>) {
    return this.deliveries.upsertRestaurant(null, body);
  }

  @Patch('restaurants/:id')
  updateRestaurant(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.deliveries.upsertRestaurant(id, body);
  }

  @Get('pricing-rules')
  listPricing() {
    return this.pricingAdmin.listRules();
  }

  @Patch('pricing-rules/:vehicleType')
  updatePricing(@Param('vehicleType') vehicleType: VehicleType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateRule(vehicleType, body);
  }
}
