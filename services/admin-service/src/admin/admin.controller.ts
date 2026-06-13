import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@mova/shared';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';

class ApproveKycDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
}

class UpdateUserDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() role?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
}

class DriverStatusDto {
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() suspendUser?: boolean;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('metrics')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Tableau de bord métriques' })
  metrics() {
    return this.adminService.getMetrics();
  }

  @Get('users')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Liste utilisateurs' })
  users(@Query('skip') skip?: string, @Query('take') take?: string, @Query('search') search?: string) {
    return this.adminService.listUsers(Number(skip ?? 0), Number(take ?? 50), search);
  }

  @Get('users/:id')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Détail utilisateur' })
  user(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Modifier utilisateur' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto as unknown as Record<string, unknown>);
  }

  @Delete('users/:id')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Désactiver utilisateur' })
  deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Get('drivers')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Liste chauffeurs' })
  drivers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('isAvailable') isAvailable?: string,
  ) {
    return this.adminService.listDrivers(Number(skip ?? 0), Number(take ?? 50), { kycStatus, isAvailable });
  }

  @Get('drivers/:userId')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Détail chauffeur' })
  driver(@Param('userId') userId: string) {
    return this.adminService.getDriver(userId);
  }

  @Patch('drivers/:userId/status')
  @RequirePermissions(AdminPermission.DRIVERS_WRITE)
  @ApiOperation({ summary: 'Activer/suspendre chauffeur' })
  driverStatus(@Param('userId') userId: string, @Body() dto: DriverStatusDto) {
    return this.adminService.setDriverStatus(userId, dto.active, dto.suspendUser ?? !dto.active);
  }

  @Get('kyc/pending')
  @RequirePermissions(AdminPermission.KYC_READ)
  @ApiOperation({ summary: 'KYC en attente' })
  pendingKyc() {
    return this.adminService.pendingKyc();
  }

  @Post('kyc/:id/review')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter KYC' })
  reviewKyc(@Param('id') id: string, @Body() dto: ApproveKycDto) {
    return this.adminService.approveKyc(id, dto.approved, dto.notes);
  }

  @Get('rides')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Liste courses taxi' })
  rides(
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listRides({ status, from, to, skip: Number(skip ?? 0), take: Number(take ?? 50) });
  }

  @Get('rides/:id')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Détail course' })
  getRide(@Param('id') id: string) {
    return this.adminService.getRide(id);
  }

  @Post('rides/:id/cancel')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Annuler course' })
  cancelRide(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.cancelRide(id, reason);
  }

  @Patch('rides/:id/status')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Résolution litige / statut course' })
  rideStatus(@Param('id') id: string, @Body('status') status: string, @Body('reason') reason?: string) {
    return this.adminService.updateRideStatus(id, status, reason);
  }

  @Get('incidents')
  @RequirePermissions(AdminPermission.INCIDENTS_READ)
  @ApiOperation({ summary: 'Liste incidents' })
  incidents() {
    return this.adminService.listIncidents();
  }

  @Post('incidents/:id/resolve')
  @RequirePermissions(AdminPermission.INCIDENTS_WRITE)
  @ApiOperation({ summary: 'Résoudre incident' })
  resolve(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.resolveIncident(id, status ?? 'RESOLVED');
  }

  @Get('deliveries')
  @RequirePermissions(AdminPermission.DELIVERIES_READ)
  @ApiOperation({ summary: 'Vue livraisons' })
  deliveries() {
    return this.adminService.listDeliveries();
  }

  @Get('deliveries/:id')
  @RequirePermissions(AdminPermission.DELIVERIES_READ)
  @ApiOperation({ summary: 'Détail livraison' })
  delivery(@Param('id') id: string) {
    return this.adminService.getDelivery(id);
  }

  @Patch('deliveries/:id/status')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Mettre à jour statut livraison' })
  deliveryStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateDeliveryStatus(id, status);
  }

  @Post('deliveries/:id/cancel')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Annuler livraison' })
  cancelDelivery(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.cancelDelivery(id, reason);
  }

  @Get('scheduled-rides')
  @RequirePermissions(AdminPermission.SCHEDULED_READ)
  @ApiOperation({ summary: 'Réservations planifiées' })
  scheduledRides() {
    return this.adminService.listScheduledRides();
  }

  @Post('scheduled-rides/:id/cancel')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Annuler réservation planifiée' })
  cancelScheduled(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.cancelScheduledRide(id, reason);
  }

  @Patch('scheduled-rides/:id/status')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Mettre à jour statut réservation' })
  scheduledStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateScheduledRideStatus(id, status);
  }

  @Get('restaurants')
  @RequirePermissions(AdminPermission.RESTAURANTS_READ)
  @ApiOperation({ summary: 'Liste restaurants' })
  restaurants() {
    return this.adminService.listRestaurants();
  }

  @Post('restaurants')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Créer restaurant' })
  createRestaurant(@Body() body: Record<string, unknown>) {
    return this.adminService.createRestaurant(body);
  }

  @Post('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Modifier restaurant (legacy POST)' })
  updateRestaurantPost(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateRestaurant(id, body);
  }

  @Patch('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Modifier restaurant' })
  updateRestaurant(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateRestaurant(id, body);
  }

  @Delete('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Supprimer restaurant (soft)' })
  deleteRestaurant(@Param('id') id: string) {
    return this.adminService.deleteRestaurant(id);
  }

  @Get('pricing-rules')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Règles tarifaires véhicules' })
  pricingRules() {
    return this.adminService.listPricingRules();
  }

  @Post('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer/mettre à jour tarif véhicule' })
  createPricingPost(@Param('vehicleType') vehicleType: string, @Body() body: Record<string, unknown>) {
    return this.adminService.createPricingRule(vehicleType, body);
  }

  @Patch('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier tarif véhicule' })
  updatePricing(@Param('vehicleType') vehicleType: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePricingRule(vehicleType, body);
  }

  @Delete('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Désactiver règle tarifaire' })
  deletePricing(@Param('vehicleType') vehicleType: string) {
    return this.adminService.deletePricingRule(vehicleType);
  }

  @Get('communes')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Communes Kinshasa' })
  communes(@Query('city') city?: string) {
    return this.adminService.listCommunes(city);
  }

  @Patch('communes/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier commune' })
  updateCommune(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCommune(id, body);
  }

  @Get('carpool')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Trajets covoiturage' })
  carpool(@Query('take') take?: string) {
    return this.adminService.listCarpool(Number(take ?? 50));
  }

  @Post('carpool/:id/cancel')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Annuler trajet covoiturage' })
  cancelCarpool(@Param('id') id: string) {
    return this.adminService.cancelCarpool(id);
  }

  @Patch('carpool/:id/status')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Statut covoiturage' })
  carpoolStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateCarpoolStatus(id, status);
  }

  @Get('moving')
  @RequirePermissions(AdminPermission.DELIVERIES_READ)
  @ApiOperation({ summary: 'Demandes déménagement' })
  moving(@Query('take') take?: string) {
    return this.adminService.listMoving(Number(take ?? 50));
  }

  @Post('moving/:id/cancel')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Annuler déménagement' })
  cancelMoving(@Param('id') id: string) {
    return this.adminService.cancelMoving(id);
  }

  @Patch('moving/:id/status')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Statut déménagement' })
  movingStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateMovingStatus(id, status);
  }

  @Get('rental-inquiries')
  @RequirePermissions(AdminPermission.SCHEDULED_READ)
  @ApiOperation({ summary: 'Demandes location' })
  rentalInquiries(@Query('take') take?: string) {
    return this.adminService.listRentalInquiries(Number(take ?? 50));
  }

  @Post('rental-inquiries/:id/cancel')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Annuler demande location' })
  cancelRental(@Param('id') id: string) {
    return this.adminService.cancelRentalInquiry(id);
  }

  @Patch('rental-inquiries/:id/status')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Statut demande location' })
  rentalStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateRentalInquiryStatus(id, status);
  }

  @Get('wallet/transactions')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Transactions portefeuille' })
  walletTransactions(@Query('skip') skip?: string, @Query('take') take?: string, @Query('userId') userId?: string) {
    return this.adminService.listWalletTransactions(Number(skip ?? 0), Number(take ?? 50), userId);
  }

  @Get('wallet/:userId')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Portefeuille utilisateur' })
  wallet(@Param('userId') userId: string) {
    return this.adminService.getWallet(userId);
  }

  @Post('wallet/:userId/adjust')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Ajustement manuel portefeuille (mock)' })
  adjustWallet(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; type: 'CREDIT' | 'DEBIT'; description: string },
  ) {
    return this.adminService.adjustWallet(userId, body);
  }

  @Get('surcharges')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Majorations livraison, express, déménagement' })
  surcharges() {
    return this.adminService.listSurcharges();
  }

  @Patch('surcharges/:type')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier majoration service' })
  updateSurcharge(@Param('type') type: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateSurcharge(type, body);
  }

  @Get('promo-codes')
  @RequirePermissions(AdminPermission.PROMO_READ)
  @ApiOperation({ summary: 'Codes promo' })
  promoCodes() {
    return this.adminService.listPromoCodes();
  }

  @Post('promo-codes')
  @RequirePermissions(AdminPermission.PROMO_WRITE)
  @ApiOperation({ summary: 'Créer code promo' })
  createPromoCode(@Body() body: Record<string, unknown>) {
    return this.adminService.createPromoCode(body);
  }

  @Patch('promo-codes/:id')
  @RequirePermissions(AdminPermission.PROMO_WRITE)
  @ApiOperation({ summary: 'Modifier code promo' })
  updatePromoCode(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePromoCode(id, body);
  }

  @Get('subscription-plans')
  @RequirePermissions(AdminPermission.SUBSCRIPTIONS_READ)
  @ApiOperation({ summary: 'Plans abonnement MOVA Plus' })
  subscriptionPlans() {
    return this.adminService.listSubscriptionPlans();
  }

  @Post('subscription-plans')
  @RequirePermissions(AdminPermission.SUBSCRIPTIONS_WRITE)
  @ApiOperation({ summary: 'Créer plan abonnement' })
  createSubscriptionPlan(@Body() body: Record<string, unknown>) {
    return this.adminService.createSubscriptionPlan(body);
  }

  @Patch('subscription-plans/:id')
  @RequirePermissions(AdminPermission.SUBSCRIPTIONS_WRITE)
  @ApiOperation({ summary: 'Modifier/désactiver plan abonnement' })
  updateSubscriptionPlan(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateSubscriptionPlan(id, body);
  }

  @Get('subscriptions')
  @RequirePermissions(AdminPermission.SUBSCRIPTIONS_READ)
  @ApiOperation({ summary: 'Liste abonnés' })
  subscribers(
    @Query('planId') planId?: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listSubscribers({ planId, status, skip: Number(skip ?? 0), take: Number(take ?? 50) });
  }
}
