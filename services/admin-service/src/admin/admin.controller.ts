import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminPermission } from '@mova/shared';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { FraudService } from './fraud.service';

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
  constructor(private adminService: AdminService, private fraudService: FraudService) {}

  @Get('metrics')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Tableau de bord métriques' })
  metrics() {
    return this.adminService.getMetrics();
  }

  @Get('reports')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Rapports analytiques (séries temporelles, KPIs)' })
  reports(@Query('days') days?: string) {
    return this.adminService.getReports(Number(days ?? 30));
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

  @Patch('drivers/:userId/kyc')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter KYC chauffeur (profil)' })
  reviewDriverKyc(@Param('userId') userId: string, @Body() dto: ApproveKycDto) {
    return this.adminService.reviewDriverKyc(userId, dto.approved, dto.notes);
  }

  @Patch('drivers/:userId/documents-renewal')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter renouvellement documents chauffeur' })
  reviewDriverDocumentsRenewal(@Param('userId') userId: string, @Body() dto: ApproveKycDto) {
    return this.adminService.reviewDriverDocumentsRenewal(userId, dto.approved, dto.notes);
  }

  @Patch('drivers/:userId/vehicle-type')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter le type d\'engin déclaré (Moto-taxi, Standard, Confort, VIP)' })
  reviewVehicleType(@Param('userId') userId: string, @Body() dto: ApproveKycDto) {
    return this.adminService.reviewVehicleTypeApproval(userId, dto.approved, dto.notes);
  }

  @Post('kyc/:id/ocr')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Lancer l\'analyse OCR sur un document KYC' })
  runKycOcr(@Param('id') id: string) {
    return this.adminService.runKycOcr(id);
  }

  @Post('drivers/:userId/activation-pin')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Générer ou régénérer le PIN d\'activation chauffeur' })
  regenerateDriverPin(@Param('userId') userId: string) {
    return this.adminService.regenerateDriverActivationPin(userId);
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

  @Get('tracking/:type/:id/trace')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Trace GPS course / livraison / commission' })
  getGpsTrace(@Param('type') type: string, @Param('id') id: string) {
    return this.adminService.getGpsTrace(type, id);
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

  @Get('fraud/alerts')
  @RequirePermissions(AdminPermission.FRAUD_READ)
  @ApiOperation({ summary: 'Alertes anti-contournement (annulations, binômes récurrents, impayés)' })
  fraudAlerts(
    @Query('days') days?: string,
    @Query('threshold') threshold?: string,
    @Query('autoCreate') autoCreate?: string,
  ) {
    return this.fraudService.getAlerts({
      days: days ? Number(days) : undefined,
      threshold: threshold ? Number(threshold) : undefined,
      autoCreate: autoCreate !== 'false',
    });
  }

  @Post('fraud/incident')
  @RequirePermissions(AdminPermission.FRAUD_WRITE)
  @ApiOperation({ summary: 'Créer manuellement un incident FRAUD depuis une alerte' })
  createFraudIncident(@Body() body: { entityId: string; entityType: 'DRIVER' | 'PASSENGER'; reasons?: string[]; score?: number }) {
    return this.fraudService.createIncident({
      entityId: body.entityId,
      entityType: body.entityType,
      reasons: body.reasons ?? [],
      score: body.score ?? 0,
    });
  }

  @Get('deliveries')
  @RequirePermissions(AdminPermission.DELIVERIES_READ)
  @ApiOperation({ summary: 'Vue livraisons' })
  deliveries(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listDeliveries({
      status,
      type,
      from,
      to,
      search,
      skip: Number(skip ?? 0),
      take: Number(take ?? 50),
    });
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

  @Patch('deliveries/:id/assign')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Assigner un chauffeur à une livraison ou course/commission' })
  assignDelivery(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.adminService.assignDeliveryDriver(id, driverId);
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

  @Patch('scheduled-rides/:id/assign')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Assigner un chauffeur à une réservation planifiée' })
  assignScheduled(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.adminService.assignScheduledDriver(id, driverId);
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

  @Get('publicites')
  @RequirePermissions(AdminPermission.PUBLICITES_READ)
  @ApiOperation({ summary: 'Liste des publicités' })
  publicites() {
    return this.adminService.listPublicites();
  }

  @Post('publicites')
  @RequirePermissions(AdminPermission.PUBLICITES_WRITE)
  @ApiOperation({ summary: 'Créer une publicité' })
  createPublicite(@Body() body: Record<string, unknown>) {
    return this.adminService.createPublicite(body);
  }

  @Patch('publicites/:id')
  @RequirePermissions(AdminPermission.PUBLICITES_WRITE)
  @ApiOperation({ summary: 'Modifier une publicité' })
  updatePublicite(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePublicite(id, body);
  }

  @Delete('publicites/:id')
  @RequirePermissions(AdminPermission.PUBLICITES_WRITE)
  @ApiOperation({ summary: 'Supprimer une publicité' })
  deletePublicite(@Param('id') id: string) {
    return this.adminService.deletePublicite(id);
  }

  @Get('pricing-rules')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Règles tarifaires véhicules' })
  pricingRules(@Query('city') city?: string) {
    return this.adminService.listPricingRules(city);
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
  deletePricing(@Param('vehicleType') vehicleType: string, @Query('city') city: string) {
    return this.adminService.deletePricingRule(vehicleType, city);
  }

  @Get('delivery-pricing-rules')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Majorations livraison par catégorie' })
  deliveryPricingRules() {
    return this.adminService.listDeliveryPricingRules();
  }

  @Patch('delivery-pricing-rules/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier majoration livraison' })
  updateDeliveryPricing(@Param('category') category: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateDeliveryPricingRule(category, body);
  }

  @Get('errand-category-estimates')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Estimation achats courses & commissions par catégorie' })
  errandCategoryEstimates() {
    return this.adminService.listErrandCategoryEstimates();
  }

  @Post('errand-category-estimates')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer catégorie estimation achats course' })
  createErrandCategoryEstimate(@Body() body: Record<string, unknown>) {
    return this.adminService.createErrandCategoryEstimate(body);
  }

  @Patch('errand-category-estimates/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier catégorie estimation achats course' })
  updateErrandCategoryEstimate(@Param('category') category: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateErrandCategoryEstimate(category, body);
  }

  @Delete('errand-category-estimates/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Désactiver catégorie estimation achats course' })
  deleteErrandCategoryEstimate(@Param('category') category: string) {
    return this.adminService.deleteErrandCategoryEstimate(category);
  }

  @Get('communes')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Quartiers/communes par ville' })
  communes(@Query('city') city?: string) {
    return this.adminService.listCommunes(city);
  }

  @Patch('communes/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier commune' })
  updateCommune(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCommune(id, body);
  }

  @Post('communes')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer une commune' })
  createCommune(@Body() body: Record<string, unknown>) {
    return this.adminService.createCommune(body);
  }

  @Delete('communes/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Supprimer une commune' })
  deleteCommune(@Param('id') id: string) {
    return this.adminService.deleteCommune(id);
  }

  @Get('provinces')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Provinces RDC' })
  provinces() {
    return this.adminService.listProvinces();
  }

  @Post('provinces')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer une province' })
  createProvince(@Body('name') name: string) {
    return this.adminService.createProvince(name);
  }

  @Patch('provinces/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier une province' })
  updateProvince(@Param('id') id: string, @Body('name') name: string) {
    return this.adminService.updateProvince(id, name);
  }

  @Delete('provinces/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Supprimer une province' })
  deleteProvince(@Param('id') id: string) {
    return this.adminService.deleteProvince(id);
  }

  @Get('cities')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Villes MOVA' })
  cities(@Query('provinceId') provinceId?: string) {
    return this.adminService.listCities(provinceId);
  }

  @Get('cities/catalog')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Catalogue villes (DB + statique)' })
  citiesCatalog() {
    return this.adminService.listCitiesCatalog();
  }

  @Post('cities')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer une ville' })
  createCity(@Body() body: Record<string, unknown>) {
    return this.adminService.createCity(body);
  }

  @Patch('cities/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier une ville' })
  updateCity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCity(id, body);
  }

  @Delete('cities/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Supprimer une ville' })
  deleteCity(@Param('id') id: string) {
    return this.adminService.deleteCity(id);
  }

  @Get('poi-suggestions')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Suggestions de lieux (POI) en attente' })
  poiSuggestions(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.adminService.listPoiSuggestions(status, Number(skip ?? 0), Number(take ?? 50));
  }

  @Post('poi-suggestions/:id/approve')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Publier une suggestion POI' })
  approvePoiSuggestion(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.approvePoiSuggestion(id, body);
  }

  @Post('poi-suggestions/:id/reject')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Refuser une suggestion POI' })
  rejectPoiSuggestion(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.rejectPoiSuggestion(id, body);
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

  @Patch('moving/:id/assign')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Assigner un chauffeur au déménagement' })
  assignMoving(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.adminService.assignMovingDriver(id, driverId);
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
  rentalStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('forceOverride') forceOverride?: boolean,
  ) {
    return this.adminService.updateRentalInquiryStatus(id, status, forceOverride === true);
  }

  @Patch('rental-inquiries/:id/assign')
  @RequirePermissions(AdminPermission.SCHEDULED_WRITE)
  @ApiOperation({ summary: 'Assigner chauffeur location (remise véhicule)' })
  assignRentalDriver(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.adminService.assignRentalDriver(id, driverId);
  }

  @Get('rental-vehicles')
  @RequirePermissions(AdminPermission.RESTAURANTS_READ)
  @ApiOperation({ summary: 'Catalogue véhicules location' })
  rentalVehicles() {
    return this.adminService.listRentalVehicles();
  }

  @Post('rental-vehicles')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Ajouter véhicule au catalogue location' })
  createRentalVehicle(@Body() body: Record<string, unknown>) {
    return this.adminService.createRentalVehicle(body);
  }

  @Patch('rental-vehicles/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Modifier véhicule catalogue location' })
  updateRentalVehicle(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateRentalVehicle(id, body);
  }

  @Delete('rental-vehicles/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Désactiver véhicule catalogue location' })
  deleteRentalVehicle(@Param('id') id: string) {
    return this.adminService.deleteRentalVehicle(id);
  }

  @Get('wallet/overview')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Agrégats portefeuilles plateforme' })
  walletOverview() {
    return this.adminService.getWalletOverview();
  }

  @Get('wallet/transactions')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Transactions portefeuille' })
  walletTransactions(@Query('skip') skip?: string, @Query('take') take?: string, @Query('userId') userId?: string) {
    return this.adminService.listWalletTransactions(Number(skip ?? 0), Number(take ?? 50), userId);
  }

  @Get('wallet/cash-debts')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Dettes espèces ouvertes (créances plateforme)' })
  cashDebts(@Query('driverUserId') driverUserId?: string) {
    return this.adminService.listCashDebts(driverUserId);
  }

  @Post('wallet/cash-debts/:debtId/settle')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Marquer une dette espèces comme réglée' })
  settleCashDebt(@Param('debtId') debtId: string, @Body() body: { settlementRef?: string }) {
    return this.adminService.settleCashDebt(debtId, body.settlementRef);
  }

  @Post('wallet/cash-debts/confirm-cash')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Confirmer un paiement espèces chauffeur via code à 6 chiffres' })
  confirmCashDebtByCode(@Request() req: { user: { id: string } }, @Body() body: { code: string }) {
    return this.adminService.confirmCashDebtByCode(body.code, req.user.id);
  }

  @Get('wallet/debt-policy')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Seuil de dette espèces chauffeurs' })
  debtPolicy() {
    return this.adminService.getDebtPolicy();
  }

  @Patch('wallet/debt-policy')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Configurer le seuil de dette espèces chauffeurs' })
  updateDebtPolicy(@Body() body: { maxOpenDebtCdf?: number; blockOffers?: boolean; isActive?: boolean }) {
    return this.adminService.updateDebtPolicy(body);
  }

  @Get('wallet/:userId')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Portefeuille utilisateur' })
  wallet(@Param('userId') userId: string) {
    return this.adminService.getWallet(userId);
  }

  @Post('wallet/:userId/adjust')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Ajustement manuel portefeuille' })
  adjustWallet(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; type: 'CREDIT' | 'DEBIT'; description: string },
  ) {
    return this.adminService.adjustWallet(userId, body);
  }

  @Post('wallet/:userId/withdraw')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Retrait Mobile Money (admin)' })
  withdrawWallet(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; provider: string; phone: string },
  ) {
    return this.adminService.withdrawWallet(userId, body);
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

  @Get('commissions')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Commissions plateforme MOVA par service' })
  commissions() {
    return this.adminService.listCommissions();
  }

  @Patch('commissions/:serviceType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier commission plateforme' })
  updateCommission(@Param('serviceType') serviceType: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCommission(serviceType, body);
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
