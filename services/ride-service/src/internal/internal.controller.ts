import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CarpoolStatus,
  CommissionServiceType,
  DeliveryStatus,
  MovingRequestStatus,
  RentalInquiryStatus,
  RideStatus,
  ScheduledRideStatus,
  VehicleType,
  SurchargeType,
} from '@prisma/client';
import { InternalApiGuard } from '../common/internal-api.guard';
import { CarpoolService } from '../carpool/carpool.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { GeoService } from '../geo/geo.service';
import { MovingService } from '../moving/moving.service';
import { PaymentInfoService } from './payment-info.service';
import { PricingAdminService } from '../rides/pricing-admin.service';
import { RentalService } from '../rental/rental.service';
import { ScheduledRidesService } from '../rides/scheduled-rides.service';
import { RidesService } from '../rides/rides.service';

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private rides: RidesService,
    private deliveries: DeliveriesService,
    private scheduledRides: ScheduledRidesService,
    private pricingAdmin: PricingAdminService,
    private paymentInfo: PaymentInfoService,
    private geo: GeoService,
    private carpool: CarpoolService,
    private moving: MovingService,
    private rental: RentalService,
  ) {}

  @Get('services/:referenceType/:referenceId/payment-info')
  getPaymentInfo(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.paymentInfo.getPaymentInfo(referenceType, referenceId);
  }

  @Get('rides/stats')
  stats() {
    return this.rides.getStats();
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

  @Post('rides/:id/cancel')
  cancelRide(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.rides.adminCancelRide(id, reason);
  }

  @Patch('rides/:id/status')
  updateRideStatus(@Param('id') id: string, @Body('status') status: RideStatus, @Body('reason') reason?: string) {
    return this.rides.adminUpdateStatus(id, status, reason);
  }

  @Get('deliveries')
  listDeliveries(@Query('take') take?: string) {
    return this.deliveries.listForAdmin(Number(take ?? 50));
  }

  @Get('deliveries/:id')
  getDelivery(@Param('id') id: string) {
    return this.deliveries.getDeliveryAdmin(id);
  }

  @Patch('deliveries/:id/status')
  updateDeliveryStatus(@Param('id') id: string, @Body('status') status: DeliveryStatus) {
    return this.deliveries.updateStatusAdmin(id, status);
  }

  @Post('deliveries/:id/cancel')
  cancelDelivery(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.deliveries.adminCancelDelivery(id, reason);
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

  @Get('rental-inquiries')
  listRental(@Query('take') take?: string) {
    return this.rental.listForAdmin(Number(take ?? 50));
  }

  @Post('rental-inquiries/:id/cancel')
  cancelRental(@Param('id') id: string) {
    return this.rental.adminCancel(id);
  }

  @Patch('rental-inquiries/:id/status')
  updateRentalStatus(@Param('id') id: string, @Body('status') status: RentalInquiryStatus) {
    return this.rental.adminUpdateStatus(id, status);
  }
}
