import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CarpoolStatus,
  CommissionServiceType,
  DeliveryStatus,
  ErrandOrderStatus,
  MovingRequestStatus,
  RentalInquiryStatus,
  RideStatus,
  ScheduledRideStatus,
  VehicleType,
  SurchargeType,
} from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { InternalApiGuard } from '../common/internal-api.guard';
import { CarpoolService } from '../carpool/carpool.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ErrandsService } from '../errands/errands.service';
import { GeoService } from '../geo/geo.service';
import { MovingService } from '../moving/moving.service';
import { PaymentInfoService } from './payment-info.service';
import { PricingAdminService } from '../rides/pricing-admin.service';
import { RentalService } from '../rental/rental.service';
import { ScheduledRidesService } from '../rides/scheduled-rides.service';
import { RidesService } from '../rides/rides.service';
import { FraudService } from '../fraud/fraud.service';
import { TrackingService } from '../tracking/tracking.service';

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private rides: RidesService,
    private deliveries: DeliveriesService,
    private errands: ErrandsService,
    private scheduledRides: ScheduledRidesService,
    private pricingAdmin: PricingAdminService,
    private paymentInfo: PaymentInfoService,
    private geo: GeoService,
    private carpool: CarpoolService,
    private moving: MovingService,
    private rental: RentalService,
    private tracking: TrackingService,
    private fraud: FraudService,
  ) {}

  @Get('fraud/signals')
  fraudSignals(@Query('days') days?: string, @Query('minPair') minPair?: string) {
    return this.fraud.getSignals(Number(days ?? 30), Number(minPair ?? 2));
  }

  @Get('tracking/:type/:id/trace')
  getGpsTrace(@Param('type') type: string, @Param('id') id: string) {
    const referenceType = this.tracking.normalizeType(type);
    return this.tracking.getTraceSummary(referenceType, id);
  }

  @Get('services/:referenceType/:referenceId/payment-info')
  getPaymentInfo(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.paymentInfo.getPaymentInfo(referenceType, referenceId);
  }

  @Get('rides/stats')
  stats() {
    return this.rides.getStats();
  }

  @Get('rides/reports')
  reports(@Query('days') days?: string) {
    return this.rides.getReportAnalytics(Number(days ?? 30));
  }

  @Get('rides/driver/:userId/earnings')
  earnings(@Param('userId') userId: string) {
    return this.rides.getDriverEarnings(userId);
  }

  @Get('rides/driver/:userId/payout-items')
  driverPayoutItems(@Param('userId') userId: string) {
    return this.rides.getDriverPayoutItems(userId);
  }

  @Get('rides/:id/payout')
  ridePayout(@Param('id') id: string) {
    return this.rides.getRidePayout(id);
  }

  @Get('services/:referenceType/:referenceId/payout')
  servicePayout(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.rides.getServicePayout(referenceType, referenceId);
  }

  @Get('rides')
  listRides(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.rides.listForAdmin({ status, from, to, skip: Number(skip ?? 0), take: Number(take ?? 50) });
  }

  @Get('rides/:id')
  getRide(@Param('id') id: string) {
    return this.rides.getRide(id);
  }

  @Get('passengers/:userId/unpaid-ride')
  passengerUnpaidRide(@Param('userId') userId: string) {
    return this.rides.findPassengerUnpaidRide(userId);
  }

  @Post('rides/:id/cancel')
  cancelRide(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.rides.adminCancelRide(id, reason);
  }

  @Patch('rides/:id/status')
  updateRideStatus(@Param('id') id: string, @Body('status') status: RideStatus, @Body('reason') reason?: string) {
    return this.rides.adminUpdateStatus(id, status, reason);
  }

  @Get('deliveries')
  async listDeliveries(@Query('take') take?: string) {
    const limit = Number(take ?? 50);
    const [deliveries, errands] = await Promise.all([
      this.deliveries.listForAdmin(limit),
      this.errands.listForAdmin(limit),
    ]);
    return [...deliveries, ...errands]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  @Get('deliveries/:id')
  async getDelivery(@Param('id') id: string) {
    try {
      return await this.deliveries.getDeliveryAdmin(id);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errands.getAdmin(id);
      }
      throw error;
    }
  }

  @Patch('deliveries/:id/status')
  async updateDeliveryStatus(@Param('id') id: string, @Body('status') status: DeliveryStatus | ErrandOrderStatus) {
    try {
      return await this.deliveries.updateStatusAdmin(id, status as DeliveryStatus);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errands.adminUpdateStatus(id, status as ErrandOrderStatus);
      }
      throw error;
    }
  }

  @Post('deliveries/:id/cancel')
  async cancelDelivery(@Param('id') id: string, @Body('reason') reason?: string) {
    try {
      return await this.deliveries.adminCancelDelivery(id, reason);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errands.adminCancel(id, reason);
      }
      throw error;
    }
  }

  @Patch('deliveries/:id/assign')
  async assignDelivery(@Param('id') id: string, @Body('driverId') driverId: string) {
    try {
      return await this.deliveries.adminAssignDriver(id, driverId);
    } catch (error) {
      if (error instanceof MovaHttpException && error.code === MovaErrorCode.DELIVERY_NOT_FOUND) {
        return this.errands.adminAssignDriver(id, driverId);
      }
      throw error;
    }
  }

  @Get('scheduled-rides')
  listScheduled(@Query('take') take?: string) {
    return this.scheduledRides.listForAdmin(Number(take ?? 50));
  }

  @Post('scheduled-rides/:id/cancel')
  cancelScheduled(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.scheduledRides.adminCancel(id, reason);
  }

  @Patch('scheduled-rides/:id/status')
  updateScheduledStatus(@Param('id') id: string, @Body('status') status: ScheduledRideStatus) {
    return this.scheduledRides.adminUpdateStatus(id, status);
  }

  @Patch('scheduled-rides/:id/assign')
  assignScheduled(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.scheduledRides.adminAssignDriver(id, driverId);
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

  @Delete('restaurants/:id')
  deleteRestaurant(@Param('id') id: string) {
    return this.deliveries.deleteRestaurant(id);
  }

  @Get('pricing-rules')
  listPricing(@Query('city') city?: string) {
    return this.pricingAdmin.listRules(city);
  }

  @Post('pricing-rules/:vehicleType')
  createPricing(@Param('vehicleType') vehicleType: VehicleType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.createRule(vehicleType, body as never);
  }

  @Patch('pricing-rules/:vehicleType')
  updatePricing(@Param('vehicleType') vehicleType: VehicleType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateRule(vehicleType, body);
  }

  @Delete('pricing-rules/:vehicleType')
  deletePricing(@Param('vehicleType') vehicleType: VehicleType, @Query('city') city: string) {
    return this.pricingAdmin.deleteRule(vehicleType, city);
  }

  @Get('surcharges')
  listSurcharges() {
    return this.pricingAdmin.listSurcharges();
  }

  @Patch('surcharges/:type')
  updateSurcharge(@Param('type') type: SurchargeType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateSurcharge(type, body);
  }

  @Get('delivery-pricing-rules')
  listDeliveryPricing() {
    return this.pricingAdmin.listDeliveryPricingRules();
  }

  @Patch('delivery-pricing-rules/:category')
  updateDeliveryPricing(@Param('category') category: string, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateDeliveryPricingRule(category, body);
  }

  @Get('commissions')
  listCommissions() {
    return this.pricingAdmin.listCommissions();
  }

  @Patch('commissions/:serviceType')
  updateCommission(@Param('serviceType') serviceType: CommissionServiceType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateCommission(serviceType, body as never);
  }

  @Get('promo-codes')
  listPromoCodes() {
    return this.pricingAdmin.listPromoCodes();
  }

  @Post('promo-codes')
  createPromoCode(@Body() body: Record<string, unknown>) {
    return this.pricingAdmin.createPromoCode(body as never);
  }

  @Patch('promo-codes/:id')
  updatePromoCode(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updatePromoCode(id, body);
  }

  @Get('communes')
  listCommunes(@Query('city') city?: string) {
    return this.geo.getCommunes(city);
  }

  @Post('communes')
  createCommune(@Body() body: { name: string; city: string; lat: number; lng: number }) {
    return this.geo.createCommune(body);
  }

  @Patch('communes/:id')
  updateCommune(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.geo.updateCommune(id, body);
  }

  @Delete('communes/:id')
  deleteCommune(@Param('id') id: string) {
    return this.geo.deleteCommune(id);
  }

  @Get('provinces')
  listProvinces() {
    return this.geo.listProvinces();
  }

  @Post('provinces')
  createProvince(@Body('name') name: string) {
    return this.geo.createProvince(name);
  }

  @Patch('provinces/:id')
  updateProvince(@Param('id') id: string, @Body('name') name: string) {
    return this.geo.updateProvince(id, name);
  }

  @Delete('provinces/:id')
  deleteProvince(@Param('id') id: string) {
    return this.geo.deleteProvince(id);
  }

  @Get('cities')
  listCities(@Query('provinceId') provinceId?: string) {
    return this.geo.listCities(provinceId);
  }

  @Get('cities/catalog')
  citiesCatalog() {
    return this.geo.listCitiesCatalog();
  }

  @Post('cities')
  createCity(@Body() body: {
    name: string;
    slug: string;
    provinceId: string;
    centerLat: number;
    centerLng: number;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
    isActive?: boolean;
  }) {
    return this.geo.createCity(body);
  }

  @Patch('cities/:id')
  updateCity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.geo.updateCity(id, body);
  }

  @Delete('cities/:id')
  deleteCity(@Param('id') id: string) {
    return this.geo.deleteCity(id);
  }

  @Get('carpool')
  listCarpool(@Query('take') take?: string) {
    return this.carpool.listForAdmin(Number(take ?? 50));
  }

  @Post('carpool/:id/cancel')
  cancelCarpool(@Param('id') id: string) {
    return this.carpool.adminCancel(id);
  }

  @Patch('carpool/:id/status')
  updateCarpoolStatus(@Param('id') id: string, @Body('status') status: CarpoolStatus) {
    return this.carpool.adminUpdateStatus(id, status);
  }

  @Get('moving')
  listMoving(@Query('take') take?: string) {
    return this.moving.listForAdmin(Number(take ?? 50));
  }

  @Post('moving/:id/cancel')
  cancelMoving(@Param('id') id: string) {
    return this.moving.adminCancel(id);
  }

  @Patch('moving/:id/status')
  updateMovingStatus(@Param('id') id: string, @Body('status') status: MovingRequestStatus) {
    return this.moving.adminUpdateStatus(id, status);
  }

  @Patch('moving/:id/assign')
  assignMoving(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.moving.adminAssignDriver(id, driverId);
  }

  @Get('rental-inquiries')
  listRental(@Query('take') take?: string) {
    return this.rental.listForAdmin(Number(take ?? 50));
  }

  @Post('rental-inquiries/:id/cancel')
  cancelRental(@Param('id') id: string) {
    return this.rental.adminCancel(id);
  }

  @Patch('rental-inquiries/:id/status')
  updateRentalStatus(
    @Param('id') id: string,
    @Body('status') status: RentalInquiryStatus,
    @Body('forceOverride') forceOverride?: boolean,
  ) {
    return this.rental.adminUpdateStatus(id, status, forceOverride === true);
  }

  @Patch('rental-inquiries/:id/assign')
  assignRental(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.rental.adminAssignDriver(id, driverId);
  }

  @Get('rental-vehicles')
  listRentalVehicles() {
    return this.rental.listVehiclesAdmin();
  }

  @Post('rental-vehicles')
  createRentalVehicle(@Body() body: Record<string, unknown>) {
    return this.rental.upsertVehicleAdmin(null, body);
  }

  @Patch('rental-vehicles/:id')
  updateRentalVehicle(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rental.upsertVehicleAdmin(id, body);
  }

  @Delete('rental-vehicles/:id')
  deleteRentalVehicle(@Param('id') id: string) {
    return this.rental.deleteVehicleAdmin(id);
  }
}
