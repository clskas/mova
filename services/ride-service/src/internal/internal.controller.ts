import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CarpoolStatus,
  CommissionServiceType,
  DeliveryStatus,
  ErrandCategory,
  ErrandOrderStatus,
  MovingRequestStatus,
  MovingVehicleCategory,
  PricingTimeKind,
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
import { ErrandCategoryEstimateService } from '../errands/errand-category-estimate.service';
import { GeoService } from '../geo/geo.service';
import { PoiSuggestionsService } from '../geo/poi-suggestions.service';
import { MovingService } from '../moving/moving.service';
import { MovingVehiclePricingService } from '../moving/moving-vehicle-pricing.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { ParcelWeightBandService } from '../platform/parcel-weight-band.service';
import { PaymentInfoService } from './payment-info.service';
import { PricingAdminService } from '../rides/pricing-admin.service';
import { PricingTimeWindowService } from '../rides/pricing-time-window.service';
import { RentalService } from '../rental/rental.service';
import { ScheduledRidesService } from '../rides/scheduled-rides.service';
import { RidesService } from '../rides/rides.service';
import { FraudService } from '../fraud/fraud.service';
import { TrackingService } from '../tracking/tracking.service';
import { PublicitesService } from '../publicites/publicites.service';

@ApiTags('internal')
@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(
    private rides: RidesService,
    private deliveries: DeliveriesService,
    private errands: ErrandsService,
    private errandCategoryEstimates: ErrandCategoryEstimateService,
    private scheduledRides: ScheduledRidesService,
    private pricingAdmin: PricingAdminService,
    private pricingTimeWindows: PricingTimeWindowService,
    private paymentInfo: PaymentInfoService,
    private geo: GeoService,
    private poiSuggestions: PoiSuggestionsService,
    private carpool: CarpoolService,
    private moving: MovingService,
    private movingVehiclePricing: MovingVehiclePricingService,
    private platformConfig: PlatformConfigService,
    private parcelWeightBands: ParcelWeightBandService,
    private rental: RentalService,
    private tracking: TrackingService,
    private fraud: FraudService,
    private publicites: PublicitesService,
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

  @Delete('users/:userId/data')
  purgeUserData(@Param('userId') userId: string) {
    return this.rides.purgeUserData(userId);
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
  driverPayoutItems(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.rides.getDriverPayoutItems(userId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      referenceType: type,
      q,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
  }

  @Get('rides/:id/payout')
  ridePayout(@Param('id') id: string) {
    return this.rides.getRidePayout(id);
  }

  @Get('services/:referenceType/:referenceId/payout')
  servicePayout(@Param('referenceType') referenceType: string, @Param('referenceId') referenceId: string) {
    return this.rides.getServicePayout(referenceType, referenceId);
  }

  @Get('services/DELIVERY/:referenceId/food-settlement')
  foodDeliverySettlement(@Param('referenceId') referenceId: string) {
    return this.rides.getFoodDeliverySettlement(referenceId);
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
  async listDeliveries(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const opts = {
      status,
      type,
      from,
      to,
      search,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    };
    const limit = Math.min(opts.take, 100);

    if (type === 'ERRAND') {
      return this.errands.listForAdmin({ status, from, to, search, skip: opts.skip, take: limit });
    }
    if (type && type !== 'ERRAND') {
      return this.deliveries.listForAdmin({ ...opts, take: limit });
    }

    const fetchEach = limit + opts.skip;
    const [deliveries, errands] = await Promise.all([
      this.deliveries.listForAdmin({ status, from, to, search, skip: 0, take: fetchEach }),
      this.errands.listForAdmin({ status, from, to, search, skip: 0, take: fetchEach }),
    ]);
    return [...deliveries, ...errands]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(opts.skip, opts.skip + limit);
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

  @Post('restaurants/ensure')
  ensureRestaurant(@Body() body: { ownerUserId?: string; name?: string }) {
    const ownerUserId = body.ownerUserId?.trim();
    if (!ownerUserId) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'ownerUserId requis.');
    }
    return this.deliveries.ensureRestaurantForOwner(ownerUserId, body.name);
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

  @Get('publicites')
  listPublicites() {
    return this.publicites.listAdmin();
  }

  @Post('publicites')
  createPublicite(@Body() body: Record<string, unknown>) {
    return this.publicites.create(body);
  }

  @Patch('publicites/:id')
  updatePublicite(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.publicites.update(id, body);
  }

  @Delete('publicites/:id')
  deletePublicite(@Param('id') id: string) {
    return this.publicites.remove(id);
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

  @Get('moving-vehicle-categories')
  listMovingVehicleCategories() {
    return this.movingVehiclePricing.listAll();
  }

  @Patch('moving-vehicle-categories/:category')
  updateMovingVehicleCategory(
    @Param('category') category: string,
    @Body() body: { label?: string; multiplier?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.movingVehiclePricing.update(category as MovingVehicleCategory, body);
  }

  @Get('platform-config')
  getPlatformConfig() {
    return {
      config: this.platformConfig.get(),
      overrides: this.platformConfig.getOverrides(),
      defaults: this.platformConfig.getDefaults(),
    };
  }

  @Patch('platform-config')
  updatePlatformConfig(@Body() body: Record<string, unknown>) {
    return this.platformConfig.update(body as never);
  }

  @Get('cancellation-policies')
  listCancellationPolicies() {
    return this.pricingAdmin.listCancellationPolicies();
  }

  @Patch('cancellation-policies/:vehicleType')
  updateCancellationPolicy(@Param('vehicleType') vehicleType: VehicleType, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateCancellationPolicy(vehicleType, body as never);
  }

  @Get('parcel-weight-bands')
  listParcelWeightBands() {
    return this.parcelWeightBands.listAll();
  }

  @Patch('parcel-weight-bands/:category')
  updateParcelWeightBand(
    @Param('category') category: string,
    @Body() body: { label?: string; maxKg?: number; multiplier?: number; sortOrder?: number; isActive?: boolean },
  ) {
    return this.parcelWeightBands.update(category as never, body);
  }

  @Get('delivery-pricing-rules')
  listDeliveryPricing() {
    return this.pricingAdmin.listDeliveryPricingRules();
  }

  @Patch('delivery-pricing-rules/:category')
  updateDeliveryPricing(@Param('category') category: string, @Body() body: Record<string, unknown>) {
    return this.pricingAdmin.updateDeliveryPricingRule(category, body);
  }

  @Get('errand-category-estimates')
  listErrandCategoryEstimates() {
    return this.errandCategoryEstimates.listAll();
  }

  @Post('errand-category-estimates')
  createErrandCategoryEstimate(
    @Body()
    body: {
      category: ErrandCategory;
      label: string;
      perItemCdf: number;
      keywordPattern?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.errandCategoryEstimates.create(body);
  }

  @Patch('errand-category-estimates/:category')
  updateErrandCategoryEstimate(
    @Param('category') category: ErrandCategory,
    @Body()
    body: Partial<{
      label: string;
      perItemCdf: number;
      keywordPattern: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return this.errandCategoryEstimates.update(category, body);
  }

  @Delete('errand-category-estimates/:category')
  deleteErrandCategoryEstimate(@Param('category') category: ErrandCategory) {
    return this.errandCategoryEstimates.deactivate(category);
  }

  @Get('pricing-time-windows')
  listPricingTimeWindows(@Query('city') city?: string) {
    return this.pricingTimeWindows.listForCity(city);
  }

  @Post('pricing-time-windows')
  createPricingTimeWindow(
    @Body()
    body: {
      city: string;
      kind: PricingTimeKind;
      startHour: number;
      endHour: number;
      label?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    return this.pricingTimeWindows.create(body);
  }

  @Patch('pricing-time-windows/:id')
  updatePricingTimeWindow(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      kind: PricingTimeKind;
      startHour: number;
      endHour: number;
      label: string | null;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    return this.pricingTimeWindows.update(id, body);
  }

  @Delete('pricing-time-windows/:id')
  deletePricingTimeWindow(@Param('id') id: string) {
    return this.pricingTimeWindows.remove(id);
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
  updateProvince(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.geo.updateProvince(id, body);
  }

  @Delete('provinces/:id')
  deleteProvince(@Param('id') id: string) {
    return this.geo.deleteProvince(id);
  }

  @Post('provinces/bulk-active')
  setAllProvincesActive(@Body() body: { isActive: boolean }) {
    return this.geo.setAllProvincesActive(body.isActive === true);
  }

  @Get('cities')
  listCities(@Query('provinceId') provinceId?: string) {
    return this.geo.listCities(provinceId);
  }

  @Get('cities/catalog')
  citiesCatalog(@Query('activeOnly') activeOnly?: string) {
    return this.geo.listCitiesCatalog({ activeOnly: activeOnly === 'true' });
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

  @Post('cities/bulk-active')
  setAllCitiesActive(@Body() body: { isActive: boolean }) {
    return this.geo.setAllCitiesActive(body.isActive === true);
  }

  @Post('poi/seed')
  seedPois(@Query('city') city?: string) {
    return this.geo.importPois(city ?? 'RDC', false);
  }

  @Get('poi-suggestions')
  listPoiSuggestions(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.poiSuggestions.listForAdmin({
      status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
  }

  @Post('poi-suggestions/:id/approve')
  approvePoiSuggestion(@Param('id') id: string, @Body() body: { reviewedBy?: string }) {
    return this.poiSuggestions.approve(id, body);
  }

  @Post('poi-suggestions/:id/reject')
  rejectPoiSuggestion(@Param('id') id: string, @Body() body: { reason?: string; reviewedBy?: string }) {
    return this.poiSuggestions.reject(id, body);
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

  @Post('rental-inquiries/:id/mark-paid')
  markRentalPaid(@Param('id') id: string) {
    return this.rental.markPaid(id);
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
