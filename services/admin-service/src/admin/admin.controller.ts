import { UseInterceptors, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AdminAuditInterceptor } from '../common/admin-audit.interceptor';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AdminPermission, VehicleType, normalizeVehicleType } from '@mova/shared';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { resolveManagedCityScope, resolveCityFilterList, type AdminJwtUser } from '../common/city-scope.util';
import { AdminService } from './admin.service';
import { FraudService } from './fraud.service';
import { OpsService } from './ops.service';

class ApproveKycDto {
  @ApiProperty() @IsBoolean() approved: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ required: false, enum: ['MOTO_TAXI', 'STANDARD', 'COMFORT', 'VIP', 'FAMILIALE', 'UTILITAIRE', 'CAMION', 'TRICYCLE', 'TRIPOTEUR'] })
  @Transform(({ value }) => {
    if (value == null || value === '') return undefined;
    try {
      return normalizeVehicleType(String(value));
    } catch {
      return value;
    }
  })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}

class VehicleSeatsDto {
  @ApiProperty({ nullable: true, description: 'Places passagers (1–8, moto 1) ; null = valeur par défaut de la catégorie' })
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  passengerSeats: number | null;
}

class VehicleCargoVolumeDto {
  @ApiProperty({ nullable: true, description: 'Volume utile (m³) : utilitaire 1–25, camion 5–100 ; null = non déclaré' })
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  cargoVolumeM3: number | null;
}

class UpdateUserDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() role?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false, description: 'CITY_ADMIN only: service-area city name' })
  @IsOptional()
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  managedCity?: string | null;
  @ApiProperty({ required: false, type: [String], description: 'Niveaux d\'accès UI (SUPER_ADMIN)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessLevelIds?: string[];
  @ApiProperty({ required: false, type: [String], description: 'Permissions API override (SUPER_ADMIN)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminPermissions?: string[];
}

class CreateUserDto {
  @ApiProperty({ example: '+243900000030', required: false })
  @IsOptional()
  @IsString()
  phone?: string;
  @ApiProperty({ example: 'admin.beni@gmail.com', required: false, description: 'E-mail Google (admin ville sans téléphone)' })
  @IsOptional()
  @IsString()
  email?: string;
  @ApiProperty({ example: 'RESTAURANT' }) @IsString() role: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() status?: string;
  @ApiProperty({ required: false, description: 'CITY_ADMIN only: service-area city name' })
  @IsOptional()
  @IsString()
  managedCity?: string;
}

class DriverStatusDto {
  @ApiProperty() @IsBoolean() active: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() suspendUser?: boolean;
}

class DriverDeliveryModeDto {
  @ApiProperty({
    description: 'BOTH | RIDES_ONLY | DELIVERIES_ONLY',
    enum: ['BOTH', 'RIDES_ONLY', 'DELIVERIES_ONLY'],
    required: false,
  })
  @IsOptional()
  @IsIn(['BOTH', 'RIDES_ONLY', 'DELIVERIES_ONLY'])
  serviceMode?: 'BOTH' | 'RIDES_ONLY' | 'DELIVERIES_ONLY';

  /** @deprecated Prefer serviceMode. Kept for backward compatibility. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  acceptsDeliveries?: boolean;
}

class DriverOperatingCityDto {
  @ApiProperty({ example: 'Kinshasa', description: 'Ville SENGA (service area RDC)' })
  @IsString()
  operatingCity: string;
}

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
// Every change made in the admin is written to the audit log (who, what, target).
@UseInterceptors(AdminAuditInterceptor)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private adminService: AdminService,
    private fraudService: FraudService,
    private opsService: OpsService,
  ) {}

  /** Assign / mark-paid reserved for platform operators (not SUPPORT / CITY_ADMIN). */
  private assertOpsAdmin(user: AdminJwtUser) {
    const role = String(user?.role ?? '').toUpperCase();
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      throw new ForbiddenException('Réservé aux rôles Administrateur et Super admin.');
    }
  }

  @Get('metrics')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Tableau de bord métriques' })
  metrics(
    @Request() req: { user: AdminJwtUser },
    @Query('city') city?: string,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    const period = Number(days ?? 30);
    return this.adminService.getMetrics(scoped, Number.isFinite(period) ? period : 30, { from, to });
  }

  @Get('reports')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Rapports analytiques (séries temporelles, KPIs, commissions par ville)' })
  reports(
    @Request() req: { user: AdminJwtUser },
    @Query('days') days?: string,
    @Query('city') city?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('includeTests') includeTests?: string,
  ) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.adminService.getReports(Number(days ?? 30), scoped, { from, to }, includeTests === 'true');
  }

  @Get('users')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Liste utilisateurs' })
  users(
    @Request() req: { user: AdminJwtUser },
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('includePlayPrelaunch') includePlayPrelaunch?: string,
    @Query('city') city?: string,
    @Query('role') role?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminService.listUsers(
      Number(skip ?? 0),
      Number(take ?? 50),
      search,
      includePlayPrelaunch === 'true' || includePlayPrelaunch === '1',
      resolveCityFilterList(req.user, city),
      { role, from, to },
    );
  }

  @Get('users/play-prelaunch')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Comptes Google Play / Firebase Test Lab (sans téléphone)' })
  playPrelaunchUsers() {
    return this.adminService.listPlayPrelaunchUsers();
  }

  @Post('test-cleanup/preview')
  @RequirePermissions(AdminPermission.USERS_DELETE)
  @ApiOperation({ summary: 'Courses / services de test à annuler en comptabilité — aperçu (SUPER_ADMIN)' })
  testCleanupPreview(
    @Request() req: { user: { role: string } },
    @Body() body: { before?: string; accounts?: string[]; maxMinutes?: number; includeCancelled?: boolean; anyDuration?: boolean },
  ) {
    return this.adminService.testCleanupPreview(req.user.role, body ?? {});
  }

  @Post('test-cleanup/apply')
  @RequirePermissions(AdminPermission.USERS_DELETE)
  @ApiOperation({ summary: 'Annuler en comptabilité les éléments de test validés (SUPER_ADMIN)' })
  testCleanupApply(
    @Request() req: { user: { role: string } },
    @Body()
    body: {
      before?: string;
      accounts?: string[];
      maxMinutes?: number;
      includeCancelled?: boolean;
      anyDuration?: boolean;
      confirmKeys?: string[];
    },
  ) {
    return this.adminService.testCleanupApply(req.user.role, body ?? {});
  }

  @Post('users/purge-play-prelaunch')
  @RequirePermissions(AdminPermission.USERS_DELETE)
  @ApiOperation({ summary: 'Supprimer les comptes Play Test Lab (SUPER_ADMIN, après revue)' })
  purgePlayPrelaunch(@Request() req: { user: { id: string; role: string } }) {
    return this.adminService.purgePlayPrelaunchUsers(req.user.role, req.user.id);
  }

  @Get('users/:id')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Détail utilisateur' })
  async user(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.getUser(id, managedCity);
  }

  @Post('users')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Créer un utilisateur (partenaire restaurant / location, etc.)' })
  createUser(@Body() dto: CreateUserDto, @Request() req: { user: { role: string } }) {
    return this.adminService.createUser(dto as unknown as Record<string, unknown>, req.user.role);
  }

  @Patch('users/:id')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Modifier utilisateur' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: { user: { role: string } },
  ) {
    return this.adminService.updateUser(id, dto as unknown as Record<string, unknown>, req.user.role);
  }

  @Delete('users/:id')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Désactiver utilisateur' })
  deactivateUser(@Param('id') id: string, @Request() req: { user: { role: string } }) {
    return this.adminService.deactivateUser(id, req.user.role);
  }

  @Post('users/:id/purge')
  @RequirePermissions(AdminPermission.USERS_DELETE)
  @ApiOperation({ summary: 'Supprimer définitivement un utilisateur (SUPER_ADMIN)' })
  purgeUser(@Param('id') id: string, @Request() req: { user: { id: string; role: string } }) {
    return this.adminService.purgeUser(id, req.user.role, req.user.id);
  }

  @Get('drivers')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Liste chauffeurs' })
  drivers(
    @Request() req: { user: AdminJwtUser },
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('isAvailable') isAvailable?: string,
    @Query('includeHidden') includeHidden?: string,
    @Query('city') city?: string,
    @Query('q') q?: string,
  ) {
    const cities = resolveCityFilterList(req.user, city);
    return this.adminService.listDrivers(Number(skip ?? 0), Number(take ?? 50), {
      kycStatus,
      isAvailable,
      includeHidden: includeHidden === 'true' || includeHidden === '1',
      q,
    }, cities[0] ?? null);
  }

  @Get('drivers/:userId')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Détail chauffeur' })
  driver(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    return this.adminService.getDriver(userId, resolveManagedCityScope(req.user));
  }

  @Patch('drivers/:userId/status')
  @RequirePermissions(AdminPermission.DRIVERS_WRITE)
  @ApiOperation({ summary: 'Activer/suspendre chauffeur' })
  driverStatus(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() dto: DriverStatusDto,
  ) {
    return this.adminService.setDriverStatus(
      userId,
      dto.active,
      dto.suspendUser ?? !dto.active,
      resolveManagedCityScope(req.user),
    );
  }

  @Patch('drivers/:userId/delivery-mode')
  @RequirePermissions(AdminPermission.DRIVERS_WRITE)
  @ApiOperation({ summary: 'Mode service : BOTH | RIDES_ONLY | DELIVERIES_ONLY' })
  driverDeliveryMode(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() dto: DriverDeliveryModeDto,
  ) {
    return this.adminService.setDriverAcceptsDeliveries(
      userId,
      { serviceMode: dto.serviceMode, acceptsDeliveries: dto.acceptsDeliveries },
      resolveManagedCityScope(req.user),
    );
  }

  @Patch('drivers/:userId/operating-city')
  @RequirePermissions(AdminPermission.DRIVERS_WRITE)
  @ApiOperation({ summary: 'Modifier la ville d\'opération (SUPER_ADMIN / ADMIN)' })
  driverOperatingCity(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() dto: DriverOperatingCityDto,
  ) {
    this.assertOpsAdmin(req.user);
    return this.adminService.setDriverOperatingCity(userId, dto.operatingCity, resolveManagedCityScope(req.user));
  }

  @Get('kyc/pending')
  @RequirePermissions(AdminPermission.KYC_READ)
  @ApiOperation({ summary: 'Justificatifs KYC (filtre statut : PENDING, APPROVED, REJECTED, ALL)' })
  pendingKyc(@Request() req: { user: AdminJwtUser }, @Query('status') status?: string) {
    return this.adminService.pendingKyc(status, resolveManagedCityScope(req.user));
  }

  @Post('kyc/:id/review')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter KYC' })
  reviewKyc(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() dto: ApproveKycDto,
  ) {
    return this.adminService.approveKyc(id, dto.approved, dto.notes, resolveManagedCityScope(req.user));
  }

  @Patch('drivers/:userId/kyc')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter KYC chauffeur (profil)' })
  reviewDriverKyc(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() dto: ApproveKycDto,
  ) {
    return this.adminService.reviewDriverKyc(userId, dto.approved, dto.notes, resolveManagedCityScope(req.user));
  }

  @Patch('drivers/:userId/documents-renewal')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider/rejeter renouvellement documents chauffeur' })
  reviewDriverDocumentsRenewal(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() dto: ApproveKycDto,
  ) {
    return this.adminService.reviewDriverDocumentsRenewal(
      userId,
      dto.approved,
      dto.notes,
      resolveManagedCityScope(req.user),
    );
  }

  @Patch('drivers/:userId/vehicle-seats')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Corriger le nombre de places passagers du véhicule actif' })
  setVehicleSeats(
    @Param('userId') userId: string,
    @Body() dto: VehicleSeatsDto,
    @Request() req: { user: AdminJwtUser },
  ) {
    return this.adminService.setDriverVehicleSeats(userId, dto.passengerSeats ?? null, resolveManagedCityScope(req.user));
  }

  @Post('drivers/:userId/vehicle-photo-check')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: "Vérifier les photos du véhicule avec Claude (verdict pour l'admin)" })
  checkVehiclePhotos(@Param('userId') userId: string, @Request() req: { user: AdminJwtUser }) {
    return this.adminService.checkDriverVehiclePhotos(userId, resolveManagedCityScope(req.user));
  }

  @Patch('drivers/:userId/vehicle-cargo-volume')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Corriger le volume utile (m³) du véhicule actif (utilitaire ou camion)' })
  setVehicleCargoVolume(
    @Param('userId') userId: string,
    @Body() dto: VehicleCargoVolumeDto,
    @Request() req: { user: AdminJwtUser },
  ) {
    return this.adminService.setDriverVehicleCargoVolume(
      userId,
      dto.cargoVolumeM3 ?? null,
      resolveManagedCityScope(req.user),
    );
  }

  @Patch('drivers/:userId/vehicle-type')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider, refuser ou modifier le type d\'engin (Moto-taxi, Standard, Confort, VIP, Familiale)' })
  reviewVehicleType(
    @Param('userId') userId: string,
    @Body() dto: ApproveKycDto,
    @Request() req: { user: AdminJwtUser },
  ) {
    return this.adminService.reviewVehicleTypeApproval(
      userId,
      dto.approved,
      dto.notes,
      dto.vehicleType,
      req.user.role,
      resolveManagedCityScope(req.user),
    );
  }

  @Post('kyc/:id/ocr')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Lancer l\'analyse OCR sur un document KYC' })
  runKycOcr(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.runKycOcr(id, resolveManagedCityScope(req.user));
  }

  @Get('drivers/:userId/smile-id')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Vérification d’identité Smile ID du chauffeur' })
  driverSmileId(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    return this.adminService.driverSmileId(userId, resolveManagedCityScope(req.user));
  }

  @Post('drivers/:userId/smile-id/link')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Créer le lien de vérification Smile ID à envoyer au chauffeur' })
  createDriverSmileIdLink(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() body: { force?: boolean },
  ) {
    return this.adminService.createDriverSmileIdLink(userId, body?.force === true, resolveManagedCityScope(req.user));
  }

  @Post('drivers/:userId/smile-id/refresh')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Redemander le résultat Smile ID' })
  refreshDriverSmileId(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    return this.adminService.refreshDriverSmileId(userId, resolveManagedCityScope(req.user));
  }

  @Post('drivers/:userId/activation-pin')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Générer ou régénérer le PIN d\'activation chauffeur' })
  regenerateDriverPin(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    return this.adminService.regenerateDriverActivationPin(userId, resolveManagedCityScope(req.user));
  }

  @Delete('drivers/:userId')
  @RequirePermissions(AdminPermission.USERS_DELETE)
  @ApiOperation({ summary: 'Retirer un profil chauffeur fantôme (SUPER_ADMIN)' })
  purgeDriverProfile(@Param('userId') userId: string, @Request() req: { user: { role: string } }) {
    return this.adminService.purgeDriverProfile(userId, req.user.role);
  }

  @Get('rides')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Liste courses taxi' })
  rides(
    @Request() req: { user: AdminJwtUser },
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.listRides(
      { status, from, to, skip: Number(skip ?? 0), take: Number(take ?? 50) },
      managedCity,
    );
  }

  @Get('rides/:id')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Détail course' })
  getRide(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.getRide(id, resolveManagedCityScope(req.user));
  }

  @Get('tracking/:type/:id/trace')
  @RequirePermissions(AdminPermission.RIDES_READ)
  @ApiOperation({ summary: 'Trace GPS course / livraison / commission' })
  getGpsTrace(
    @Request() req: { user: AdminJwtUser },
    @Param('type') type: string,
    @Param('id') id: string,
  ) {
    return this.adminService.getGpsTrace(type, id, resolveManagedCityScope(req.user));
  }

  @Post('rides/:id/cancel')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Annuler course' })
  cancelRide(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.cancelRide(id, reason, resolveManagedCityScope(req.user));
  }

  @Patch('rides/:id/status')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Résolution litige / statut course' })
  rideStatus(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.updateRideStatus(id, status, reason, resolveManagedCityScope(req.user));
  }

  @Patch('rides/:id/assign')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Assigner un chauffeur à une course (ADMIN / SUPER_ADMIN)' })
  assignRide(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('driverId') driverId: string,
  ) {
    this.assertOpsAdmin(req.user);
    return this.adminService.assignRideDriver(id, driverId, resolveManagedCityScope(req.user));
  }

  @Post('rides/:id/mark-paid')
  @RequirePermissions(AdminPermission.RIDES_WRITE)
  @ApiOperation({ summary: 'Marquer une course comme payée (ADMIN / SUPER_ADMIN)' })
  markRidePaid(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    this.assertOpsAdmin(req.user);
    return this.adminService.markRidePaid(id, req.user.id, resolveManagedCityScope(req.user));
  }

  @Get('incidents')
  @RequirePermissions(AdminPermission.INCIDENTS_READ)
  @ApiOperation({ summary: 'Liste incidents' })
  incidents(@Request() req: { user: AdminJwtUser }) {
    return this.adminService.listIncidentsDetailed(resolveManagedCityScope(req.user));
  }

  @Post('incidents/:id/resolve')
  @RequirePermissions(AdminPermission.INCIDENTS_WRITE)
  @ApiOperation({ summary: 'Résoudre incident' })
  resolve(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: { status?: string; outcome?: string; comment?: string },
  ) {
    return this.adminService.resolveIncident(id, body?.status ?? 'RESOLVED', resolveManagedCityScope(req.user), req.user.id, {
      outcome: body?.outcome,
      comment: body?.comment,
    });
  }

  @Post('incidents/:id/cash-decision')
  @RequirePermissions(AdminPermission.INCIDENTS_WRITE)
  @ApiOperation({ summary: 'Litige espèces : le client a payé / n’a pas payé / sans suite' })
  cashDecision(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: { decision?: string; comment?: string },
  ) {
    // Confirming a payment moves money: platform operators only (as « marquer payé »).
    if (body?.decision === 'CUSTOMER_PAID') this.assertOpsAdmin(req.user);
    return this.adminService.decideCashDispute(
      id,
      String(body?.decision ?? ''),
      req.user.id,
      resolveManagedCityScope(req.user),
      body?.comment,
    );
  }

  @Post('incidents/:id/acknowledge')
  @RequirePermissions(AdminPermission.INCIDENTS_WRITE)
  @ApiOperation({ summary: 'Prendre en charge un SOS / incident (l’utilisateur est prévenu)' })
  acknowledgeIncident(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.acknowledgeIncident(id, req.user.id, resolveManagedCityScope(req.user));
  }

  @Post('incidents/:id/notes')
  @RequirePermissions(AdminPermission.INCIDENTS_WRITE)
  @ApiOperation({ summary: 'Ajouter une note au suivi d’un incident' })
  addIncidentNote(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body('text') text: string) {
    return this.adminService.addIncidentNote(id, req.user.id, text ?? '', resolveManagedCityScope(req.user));
  }

  @Get('fraud/alerts')
  @RequirePermissions(AdminPermission.FRAUD_READ)
  @ApiOperation({ summary: 'Alertes anti-contournement (annulations, binômes récurrents, impayés)' })
  fraudAlerts(
    @Query('days') days?: string,
    @Query('threshold') threshold?: string,
    @Query('autoCreate') autoCreate?: string,
  ) {
    // Viewing never creates disputes (autoCreate kept for compatibility, ignored).
    void autoCreate;
    return this.fraudService.getAlerts({
      days: days ? Number(days) : undefined,
      threshold: threshold ? Number(threshold) : undefined,
    });
  }

  @Post('fraud/dismiss')
  @RequirePermissions(AdminPermission.FRAUD_WRITE)
  @ApiOperation({ summary: 'Classer une alerte fraude comme faux positif (la personne n’est pas prévenue)' })
  async dismissFraudAlert(
    @Request() req: { user: AdminJwtUser },
    @Body() body: { entityId: string; entityType: 'DRIVER' | 'PASSENGER'; reasons?: string[]; score?: number; comment?: string },
  ) {
    const actorName = await this.adminService.actorDisplayName(req.user.id);
    return this.fraudService.dismissAlert(
      { entityId: body.entityId, entityType: body.entityType, reasons: body.reasons ?? [], score: body.score ?? 0 },
      actorName,
      body.comment,
    );
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
    @Request() req: { user: AdminJwtUser },
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.listDeliveries(
      {
        status,
        type,
        from,
        to,
        search,
        skip: Number(skip ?? 0),
        take: Number(take ?? 50),
      },
      managedCity,
    );
  }

  @Get('deliveries/:id')
  @RequirePermissions(AdminPermission.DELIVERIES_READ)
  @ApiOperation({ summary: 'Détail livraison' })
  delivery(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.getDelivery(id, resolveManagedCityScope(req.user));
  }

  @Patch('deliveries/:id/status')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Mettre à jour statut livraison' })
  deliveryStatus(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.adminService.updateDeliveryStatus(id, status, resolveManagedCityScope(req.user));
  }

  @Post('deliveries/:id/cancel')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Annuler livraison' })
  cancelDelivery(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.cancelDelivery(id, reason, resolveManagedCityScope(req.user));
  }

  @Patch('deliveries/:id/assign')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Assigner un livreur à une livraison (ADMIN / SUPER_ADMIN)' })
  assignDelivery(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('driverId') driverId: string,
  ) {
    this.assertOpsAdmin(req.user);
    return this.adminService.assignDeliveryDriver(id, driverId, resolveManagedCityScope(req.user));
  }

  @Post('deliveries/:id/mark-paid')
  @RequirePermissions(AdminPermission.DELIVERIES_WRITE)
  @ApiOperation({ summary: 'Marquer une livraison comme payée (ADMIN / SUPER_ADMIN)' })
  markDeliveryPaid(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('type') type?: string,
  ) {
    this.assertOpsAdmin(req.user);
    return this.adminService.markDeliveryPaid(id, req.user.id, type, resolveManagedCityScope(req.user));
  }

  @Get('scheduled-rides')
  @RequirePermissions(AdminPermission.SCHEDULED_READ)
  @ApiOperation({ summary: 'Réservations planifiées' })
  scheduledRides(@Request() req: { user: AdminJwtUser }, @Query('take') take?: string) {
    return this.adminService.listScheduledRides(Number(take ?? 50), resolveManagedCityScope(req.user));
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
  restaurants(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    const cities = resolveCityFilterList(req.user, city);
    return this.adminService.listRestaurants(cities[0] ?? null);
  }

  @Post('restaurants')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Créer restaurant' })
  createRestaurant(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    return this.adminService.createRestaurant(body, resolveManagedCityScope(req.user));
  }

  @Post('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Modifier restaurant (legacy POST)' })
  updateRestaurantPost(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateRestaurant(id, body, resolveManagedCityScope(req.user));
  }

  @Patch('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Modifier restaurant' })
  updateRestaurant(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateRestaurant(id, body, resolveManagedCityScope(req.user));
  }

  @Delete('restaurants/:id')
  @RequirePermissions(AdminPermission.RESTAURANTS_WRITE)
  @ApiOperation({ summary: 'Supprimer définitivement un restaurant' })
  deleteRestaurant(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.deleteRestaurant(id, resolveManagedCityScope(req.user));
  }

  @Get('partner-kyc/pending')
  @RequirePermissions(AdminPermission.KYC_READ)
  @ApiOperation({ summary: 'Dossiers restaurant et location (filtre statut)' })
  partnerKycPending(
    @Request() req: { user: AdminJwtUser },
    @Query('status') status?: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.adminService.listPartnerKycPending(
      status,
      includeHidden === 'true' || includeHidden === '1',
      resolveManagedCityScope(req.user),
    );
  }

  @Post('partner-kyc/documents/:id/review')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider ou refuser un justificatif partenaire' })
  reviewPartnerKycDocument(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() dto: ApproveKycDto,
  ) {
    return this.adminService.reviewPartnerKycDocument(
      id,
      dto.approved,
      dto.notes,
      resolveManagedCityScope(req.user),
    );
  }

  @Patch('partner-kyc/:subject/:userId')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Valider ou refuser un dossier restaurant / loueur' })
  reviewPartnerKycSubject(
    @Request() req: { user: AdminJwtUser },
    @Param('subject') subject: string,
    @Param('userId') userId: string,
    @Body() dto: ApproveKycDto,
  ) {
    return this.adminService.reviewPartnerKycSubject(
      subject,
      userId,
      dto.approved,
      dto.notes,
      resolveManagedCityScope(req.user),
    );
  }

  @Post('partner-kyc/:subject/:userId/login-pin')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Générer ou renvoyer le PIN de connexion restaurant / loueur' })
  issuePartnerLoginPin(
    @Request() req: { user: AdminJwtUser },
    @Param('subject') subject: string,
    @Param('userId') userId: string,
  ) {
    return this.adminService.issuePartnerLoginPin(subject, userId, resolveManagedCityScope(req.user));
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

  @Get('company-contacts')
  @RequirePermissions(AdminPermission.CONTACTS_READ)
  @ApiOperation({ summary: 'Liste des contacts AfriSoft / SENGA' })
  companyContacts(@Query('search') search?: string) {
    return this.adminService.listCompanyContacts(search);
  }

  @Post('company-contacts')
  @RequirePermissions(AdminPermission.CONTACTS_WRITE)
  @ApiOperation({ summary: 'Créer un contact entreprise' })
  createCompanyContact(@Body() body: Record<string, unknown>) {
    return this.adminService.createCompanyContact(body);
  }

  @Patch('company-contacts/:id')
  @RequirePermissions(AdminPermission.CONTACTS_WRITE)
  @ApiOperation({ summary: 'Modifier un contact entreprise' })
  updateCompanyContact(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCompanyContact(id, body);
  }

  @Delete('company-contacts/:id')
  @RequirePermissions(AdminPermission.CONTACTS_WRITE)
  @ApiOperation({ summary: 'Supprimer un contact entreprise' })
  deleteCompanyContact(@Param('id') id: string) {
    return this.adminService.deleteCompanyContact(id);
  }

  @Get('cgu')
  @RequirePermissions(AdminPermission.CGU_READ)
  @ApiOperation({ summary: 'Liste des versions CGU' })
  listCgu() {
    return this.adminService.listCgu();
  }

  @Post('cgu')
  @RequirePermissions(AdminPermission.CGU_WRITE)
  @ApiOperation({ summary: 'Créer une version CGU' })
  createCgu(@Body() body: Record<string, unknown>) {
    return this.adminService.createCgu(body);
  }

  @Patch('cgu/:id')
  @RequirePermissions(AdminPermission.CGU_WRITE)
  @ApiOperation({ summary: 'Modifier une version CGU' })
  updateCgu(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updateCgu(id, body);
  }

  @Post('cgu/:id/publish')
  @RequirePermissions(AdminPermission.CGU_WRITE)
  @ApiOperation({ summary: 'Publier une version CGU' })
  publishCgu(@Param('id') id: string) {
    return this.adminService.publishCgu(id);
  }

  @Post('cgu/:id/unpublish')
  @RequirePermissions(AdminPermission.CGU_WRITE)
  @ApiOperation({ summary: 'Retirer une version CGU de la publication' })
  unpublishCgu(@Param('id') id: string) {
    return this.adminService.unpublishCgu(id);
  }

  @Delete('cgu/:id')
  @RequirePermissions(AdminPermission.CGU_WRITE)
  @ApiOperation({ summary: 'Supprimer une version CGU non publiée' })
  deleteCgu(@Param('id') id: string) {
    return this.adminService.deleteCgu(id);
  }

  @Get('privacy')
  @RequirePermissions(AdminPermission.PRIVACY_READ)
  @ApiOperation({ summary: 'Liste des versions Politique de confidentialité (SuperAdmin)' })
  listPrivacy() {
    return this.adminService.listPrivacy();
  }

  @Post('privacy')
  @RequirePermissions(AdminPermission.PRIVACY_WRITE)
  @ApiOperation({ summary: 'Créer une version Politique de confidentialité' })
  createPrivacy(@Body() body: Record<string, unknown>) {
    return this.adminService.createPrivacy(body);
  }

  @Patch('privacy/:id')
  @RequirePermissions(AdminPermission.PRIVACY_WRITE)
  @ApiOperation({ summary: 'Modifier une version Politique de confidentialité' })
  updatePrivacy(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePrivacy(id, body);
  }

  @Post('privacy/:id/publish')
  @RequirePermissions(AdminPermission.PRIVACY_WRITE)
  @ApiOperation({ summary: 'Publier une version Politique de confidentialité' })
  publishPrivacy(@Param('id') id: string) {
    return this.adminService.publishPrivacy(id);
  }

  @Post('privacy/:id/unpublish')
  @RequirePermissions(AdminPermission.PRIVACY_WRITE)
  @ApiOperation({ summary: 'Retirer une version Politique de confidentialité de la publication' })
  unpublishPrivacy(@Param('id') id: string) {
    return this.adminService.unpublishPrivacy(id);
  }

  @Delete('privacy/:id')
  @RequirePermissions(AdminPermission.PRIVACY_WRITE)
  @ApiOperation({ summary: 'Supprimer une version Politique de confidentialité non publiée' })
  deletePrivacy(@Param('id') id: string) {
    return this.adminService.deletePrivacy(id);
  }

  @Get('pricing-rules')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Règles tarifaires véhicules' })
  pricingRules(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    // CITY_ADMIN: force managedCity; SUPER_ADMIN keeps optional city query.
    return this.adminService.listPricingRules(resolveManagedCityScope(req.user) ?? city);
  }

  @Post('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer/mettre à jour tarif véhicule' })
  createPricingPost(
    @Request() req: { user: AdminJwtUser },
    @Param('vehicleType') vehicleType: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.createPricingRule(vehicleType, body, resolveManagedCityScope(req.user));
  }

  @Patch('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier tarif véhicule' })
  updatePricing(
    @Request() req: { user: AdminJwtUser },
    @Param('vehicleType') vehicleType: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updatePricingRule(vehicleType, body, resolveManagedCityScope(req.user));
  }

  @Delete('pricing-rules/:vehicleType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Désactiver règle tarifaire' })
  deletePricing(
    @Request() req: { user: AdminJwtUser },
    @Param('vehicleType') vehicleType: string,
    @Query('city') city: string,
  ) {
    return this.adminService.deletePricingRule(vehicleType, city, resolveManagedCityScope(req.user));
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
  updateDeliveryPricing(
    @Request() req: { user: { role: string } },
    @Param('category') category: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateDeliveryPricingRule(category, body, req.user.role);
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
  createErrandCategoryEstimate(
    @Request() req: { user: { role: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.createErrandCategoryEstimate(body, req.user.role);
  }

  @Patch('errand-category-estimates/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier catégorie estimation achats course' })
  updateErrandCategoryEstimate(
    @Request() req: { user: { role: string } },
    @Param('category') category: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateErrandCategoryEstimate(category, body, req.user.role);
  }

  @Delete('errand-category-estimates/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Désactiver catégorie estimation achats course' })
  deleteErrandCategoryEstimate(
    @Request() req: { user: { role: string } },
    @Param('category') category: string,
  ) {
    return this.adminService.deleteErrandCategoryEstimate(category, req.user.role);
  }

  @Get('pricing-time-windows')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Plages horaires pointe / nuit par ville' })
  pricingTimeWindows(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    return this.adminService.listPricingTimeWindows(resolveManagedCityScope(req.user) ?? city);
  }

  @Post('pricing-time-windows')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Créer une plage horaire pointe / nuit' })
  createPricingTimeWindow(
    @Request() req: { user: AdminJwtUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.createPricingTimeWindow(body, resolveManagedCityScope(req.user));
  }

  @Patch('pricing-time-windows/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier une plage horaire pointe / nuit' })
  updatePricingTimeWindow(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updatePricingTimeWindow(id, body, resolveManagedCityScope(req.user));
  }

  @Delete('pricing-time-windows/:id')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Supprimer une plage horaire pointe / nuit' })
  deletePricingTimeWindow(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.adminService.deletePricingTimeWindow(id, resolveManagedCityScope(req.user));
  }

  @Get('communes')
  @RequirePermissions(AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Quartiers/communes par ville' })
  communes(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    return this.adminService.listCommunes(resolveManagedCityScope(req.user) ?? city);
  }

  @Patch('communes/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Modifier commune' })
  async updateCommune(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const city = resolveManagedCityScope(req.user);
    await this.adminService.assertCommuneInScope(id, city);
    return this.adminService.updateCommune(id, city ? { ...body, city } : body);
  }

  @Post('communes')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Créer une commune' })
  createCommune(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    // CITY_ADMIN: always in their own city.
    const city = resolveManagedCityScope(req.user);
    return this.adminService.createCommune(city ? { ...body, city } : body);
  }

  @Delete('communes/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Supprimer une commune' })
  async deleteCommune(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    await this.adminService.assertCommuneInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.deleteCommune(id);
  }

  @Get('provinces')
  @RequirePermissions(AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Provinces RDC' })
  provinces() {
    return this.adminService.listProvinces();
  }

  @Post('provinces')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Créer une province' })
  createProvince(@Request() req: { user: AdminJwtUser }, @Body('name') name: string) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.createProvince(name);
  }

  @Patch('provinces/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Modifier une province' })
  updateProvince(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.updateProvince(id, body);
  }

  @Delete('provinces/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Supprimer une province' })
  deleteProvince(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.deleteProvince(id);
  }

  @Post('provinces/bulk-active')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Activer ou désactiver toutes les provinces SENGA' })
  setAllProvincesActive(@Request() req: { user: AdminJwtUser }, @Body() body: { isActive: boolean }) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.setAllProvincesActive(body.isActive === true);
  }

  @Post('poi/seed')
  @RequirePermissions(AdminPermission.POI_WRITE, AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Synchroniser le catalogue POI (ville gérée ou toutes pour SUPER_ADMIN)' })
  seedPois(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    const managed = resolveManagedCityScope(req.user);
    return this.adminService.seedPois(managed ?? city);
  }

  @Get('poi-catalog')
  @RequirePermissions(AdminPermission.POI_READ, AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Catalogue POI SENGA (places_of_interest)' })
  listPoiCatalog(
    @Request() req: { user: AdminJwtUser },
    @Query('city') city?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminService.listPoiCatalog({
      city: resolveManagedCityScope(req.user) ?? city,
      q,
      skip: Number(skip ?? 0),
      take: Number(take ?? 80),
      from,
      to,
    });
  }

  @Patch('poi-catalog/:id')
  @RequirePermissions(AdminPermission.POI_WRITE, AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Modifier un lieu du catalogue SENGA (nom, adresse, catégorie…)' })
  updatePoiCatalog(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      address?: string | null;
      category?: string;
      city?: string;
      lat?: number;
      lng?: number;
    },
  ) {
    return this.adminService.updatePoiCatalog(id, body, resolveManagedCityScope(req.user));
  }

  @Get('cities')
  @RequirePermissions(AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Villes SENGA' })
  cities(@Query('provinceId') provinceId?: string) {
    return this.adminService.listCities(provinceId);
  }

  @Get('cities/catalog')
  @RequirePermissions(AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Catalogue villes (DB + statique)' })
  citiesCatalog() {
    return this.adminService.listCitiesCatalog();
  }

  @Post('cities')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Créer une ville' })
  createCity(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.createCity(body);
  }

  @Patch('cities/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Modifier une ville' })
  updateCity(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.updateCity(id, body);
  }

  @Delete('cities/:id')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Supprimer une ville' })
  deleteCity(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.deleteCity(id);
  }

  @Post('cities/bulk-active')
  @RequirePermissions(AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Activer ou désactiver toutes les villes SENGA' })
  setAllCitiesActive(@Request() req: { user: AdminJwtUser }, @Body() body: { isActive: boolean }) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.setAllCitiesActive(body.isActive === true);
  }

  @Get('poi-suggestions')
  @RequirePermissions(AdminPermission.POI_READ, AdminPermission.ZONES_READ)
  @ApiOperation({ summary: 'Suggestions de lieux (POI) en attente' })
  poiSuggestions(
    @Request() req: { user: AdminJwtUser },
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('city') city?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.adminService.listPoiSuggestions(
      status,
      Number(skip ?? 0),
      Number(take ?? 50),
      resolveManagedCityScope(req.user) ?? city,
      { from, to },
    );
  }

  @Post('poi-suggestions/:id/approve')
  @RequirePermissions(AdminPermission.POI_WRITE, AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Publier une suggestion POI' })
  approvePoiSuggestion(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.approvePoiSuggestion(id, body, resolveManagedCityScope(req.user));
  }

  @Post('poi-suggestions/:id/reject')
  @RequirePermissions(AdminPermission.POI_WRITE, AdminPermission.ZONES_WRITE)
  @ApiOperation({ summary: 'Refuser une suggestion POI' })
  rejectPoiSuggestion(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.rejectPoiSuggestion(id, body, resolveManagedCityScope(req.user));
  }

  @Get('carpool')
  @RequirePermissions(AdminPermission.CARPOOL_READ)
  @ApiOperation({ summary: 'Trajets covoiturage' })
  carpool(@Request() req: { user: AdminJwtUser }, @Query('take') take?: string) {
    return this.adminService.listCarpool(Number(take ?? 50), resolveManagedCityScope(req.user));
  }

  @Post('carpool/:id/cancel')
  @RequirePermissions(AdminPermission.CARPOOL_WRITE)
  @ApiOperation({ summary: 'Annuler trajet covoiturage' })
  cancelCarpool(@Param('id') id: string) {
    return this.adminService.cancelCarpool(id);
  }

  @Patch('carpool/:id/status')
  @RequirePermissions(AdminPermission.CARPOOL_WRITE)
  @ApiOperation({ summary: 'Statut covoiturage' })
  carpoolStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.adminService.updateCarpoolStatus(id, status);
  }

  @Get('moving')
  @RequirePermissions(AdminPermission.MOVING_READ)
  @ApiOperation({ summary: 'Demandes déménagement' })
  moving(@Request() req: { user: AdminJwtUser }, @Query('take') take?: string) {
    return this.adminService.listMoving(Number(take ?? 50), resolveManagedCityScope(req.user));
  }

  @Post('moving/:id/cancel')
  @RequirePermissions(AdminPermission.MOVING_WRITE)
  @ApiOperation({ summary: 'Annuler déménagement' })
  async cancelMoving(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    await this.adminService.assertMovingInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.cancelMoving(id);
  }

  @Patch('moving/:id/status')
  @RequirePermissions(AdminPermission.MOVING_WRITE)
  @ApiOperation({ summary: 'Statut déménagement' })
  async movingStatus(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    await this.adminService.assertMovingInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.updateMovingStatus(id, status);
  }

  @Patch('moving/:id/assign')
  @RequirePermissions(AdminPermission.MOVING_WRITE)
  @ApiOperation({ summary: 'Assigner un chauffeur au déménagement' })
  async assignMoving(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('driverId') driverId: string,
  ) {
    await this.adminService.assertMovingInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.assignMovingDriver(id, driverId);
  }

  @Get('rental-inquiries')
  @RequirePermissions(AdminPermission.RENTALS_READ)
  @ApiOperation({ summary: 'Demandes location' })
  rentalInquiries(@Request() req: { user: AdminJwtUser }, @Query('take') take?: string) {
    return this.adminService.listRentalInquiries(Number(take ?? 50), resolveManagedCityScope(req.user));
  }

  @Post('rental-inquiries/:id/cancel')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Annuler demande location' })
  async cancelRental(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    await this.adminService.assertRentalInquiryInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.cancelRentalInquiry(id);
  }

  @Patch('rental-inquiries/:id/status')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Statut demande location' })
  async rentalStatus(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('forceOverride') forceOverride?: boolean,
  ) {
    await this.adminService.assertRentalInquiryInScope(id, resolveManagedCityScope(req.user));
    // « Payée » counts as paid everywhere (like « marquer payé » on a ride), and forcing a status
    // the owner manages is exceptional: platform operators only.
    if (String(status ?? '').toUpperCase() === 'PAID' || forceOverride === true) this.assertOpsAdmin(req.user);
    return this.adminService.updateRentalInquiryStatus(id, status, forceOverride === true);
  }

  @Patch('rental-inquiries/:id/assign')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Assigner chauffeur location (remise véhicule)' })
  async assignRentalDriver(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body('driverId') driverId: string) {
    await this.adminService.assertRentalInquiryInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.assignRentalDriver(id, driverId);
  }

  @Get('rental-vehicles')
  @RequirePermissions(AdminPermission.RENTALS_READ)
  @ApiOperation({ summary: 'Catalogue véhicules location' })
  rentalVehicles(@Request() req: { user: AdminJwtUser }) {
    return this.adminService.listRentalVehicles(resolveManagedCityScope(req.user));
  }

  @Post('rental-vehicles')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Ajouter véhicule au catalogue location' })
  createRentalVehicle(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    const city = resolveManagedCityScope(req.user);
    return this.adminService.createRentalVehicle(city ? { ...body, city } : body);
  }

  @Patch('rental-vehicles/:id')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Modifier véhicule catalogue location' })
  async updateRentalVehicle(@Request() req: { user: AdminJwtUser }, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const city = resolveManagedCityScope(req.user);
    await this.adminService.assertRentalVehicleInScope(id, city);
    return this.adminService.updateRentalVehicle(id, city ? { ...body, city } : body);
  }

  @Delete('rental-vehicles/:id')
  @RequirePermissions(AdminPermission.RENTALS_WRITE)
  @ApiOperation({ summary: 'Désactiver véhicule catalogue location' })
  async deleteRentalVehicle(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    await this.adminService.assertRentalVehicleInScope(id, resolveManagedCityScope(req.user));
    return this.adminService.deleteRentalVehicle(id);
  }

  @Get('money-control/latest')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Dernier contrôle des comptes (lecture seule)' })
  moneyControlLatest() {
    return this.adminService.moneyControlLatest();
  }

  @Post('money-control/run')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Lancer le contrôle des comptes maintenant (ne déplace pas d’argent)' })
  moneyControlRun() {
    return this.adminService.moneyControlRun();
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
  walletTransactions(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('userId') userId?: string,
    @Query('kind') kind?: string,
  ) {
    return this.adminService.listWalletTransactions(Number(skip ?? 0), Number(take ?? 50), userId, kind);
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
  updateDebtPolicy(@Body() body: {
    maxOpenDebtCdf?: number;
    blockOffers?: boolean;
    isActive?: boolean;
    requirePositiveWalletBalance?: boolean;
  }) {
    return this.adminService.updateDebtPolicy(body);
  }

  @Post('wallet/treasury/reverse-virtual-float')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({
    summary: 'Annuler les apports virtuels admin sur la trésorerie SENGA (idempotent)',
  })
  reverseVirtualTreasuryFloat() {
    return this.adminService.reverseVirtualTreasuryFloat();
  }

  @Post('wallet/treasury/clawback-open-cash-fees')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({
    summary: 'Retirer de la trésorerie les commissions espèces encore ouvertes (idempotent)',
  })
  clawbackOpenCashFeeAccruals() {
    return this.adminService.clawbackOpenCashFeeAccruals();
  }

  @Post('wallet/:userId/top-up')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Recharge Mobile Money (C2B) — trésorerie ou utilisateur' })
  topUpWallet(
    @Param('userId') userId: string,
    @Body() body: { amountCdf: number; provider: string; phone: string },
  ) {
    return this.adminService.topUpWallet(userId, body);
  }

  @Get('wallet/:userId/top-up/status')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Statut recharge Mobile Money (polling)' })
  topUpWalletStatus(@Param('userId') userId: string, @Query('providerRef') providerRef?: string) {
    return this.adminService.topUpWalletStatus(userId, providerRef?.trim() ?? '');
  }

  @Get('wallet/:userId')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Portefeuille utilisateur' })
  wallet(@Param('userId') userId: string) {
    return this.adminService.getWallet(userId);
  }

  @Post('wallet/:userId/write-off-deleted')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Solder le portefeuille gelé d’un compte supprimé — SuperAdmin' })
  writeOffDeletedWallet(
    @Request() req: { user: AdminJwtUser },
    @Param('userId') userId: string,
    @Body() body: { reason?: string },
  ) {
    if (req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul le super administrateur peut solder un compte supprimé.');
    }
    return this.adminService.writeOffDeletedWallet(userId, String(body?.reason ?? ''));
  }

  @Post('wallet/:userId/adjust')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  @ApiOperation({ summary: 'Ajustement manuel portefeuille (ops / urgence)' })
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
  updateSurcharge(
    @Request() req: { user: AdminJwtUser },
    @Param('type') type: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateSurcharge(type, body, req.user.role);
  }

  @Get('moving-vehicle-categories')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Coefficients tarifaires par type d\'engin déménagement' })
  movingVehicleCategories() {
    return this.adminService.listMovingVehicleCategories();
  }

  @Patch('moving-vehicle-categories/:category')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier coefficient engin déménagement' })
  updateMovingVehicleCategory(
    @Request() req: { user: AdminJwtUser },
    @Param('category') category: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateMovingVehicleCategory(category, body, req.user.role);
  }

  @Get('external-platforms')
  @RequirePermissions(AdminPermission.SYSTEM_READ)
  @ApiOperation({ summary: 'Plateformes externes : état de configuration et échéances (SuperAdmin)' })
  externalPlatforms(@Request() req: { user: AdminJwtUser }) {
    return this.adminService.externalPlatforms(req.user.role);
  }

  @Get('drivers-quality-blocked')
  @RequirePermissions(AdminPermission.RULES_READ)
  qualityBlockedDrivers() {
    return this.adminService.qualityBlockedDrivers();
  }

  @Post('drivers/:userId/quality-unblock')
  @RequirePermissions(AdminPermission.RULES_WRITE)
  qualityUnblock(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    return this.adminService.qualityUnblock(userId, req.user.role);
  }

  @Get('corporate/accounts')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  @ApiOperation({ summary: 'Comptes entreprises' })
  corporateList() {
    return this.adminService.corporateList();
  }

  @Post('corporate/accounts')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  corporateCreate(@Body() body: Record<string, unknown>) {
    return this.adminService.corporateCreate(body);
  }

  @Patch('corporate/accounts/:id')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  corporateUpdate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.corporateUpdate(id, body);
  }

  @Get('corporate/accounts/:id/members')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  corporateMembers(@Param('id') id: string) {
    return this.adminService.corporateMembers(id);
  }

  @Post('corporate/accounts/:id/members')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  corporateAddMember(@Param('id') id: string, @Body() body: { phone?: string; label?: string }) {
    return this.adminService.corporateAddMember(id, body ?? {});
  }

  @Post('corporate/members/:memberId/remove')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  corporateRemoveMember(@Param('memberId') memberId: string) {
    return this.adminService.corporateRemoveMember(memberId);
  }

  @Post('corporate/accounts/:id/settle')
  @RequirePermissions(AdminPermission.WALLETS_WRITE)
  corporateSettle(@Param('id') id: string, @Body() body: { amountCdf?: number; note?: string }) {
    return this.adminService.corporateSettle(id, body ?? {});
  }

  @Get('corporate/accounts/:id/statement')
  @RequirePermissions(AdminPermission.WALLETS_READ)
  corporateStatement(@Param('id') id: string) {
    return this.adminService.corporateStatement(id);
  }

  @Get('platform-config')
  @RequirePermissions(AdminPermission.RULES_READ)
  @ApiOperation({ summary: 'Configuration plateforme (dispatch, inter-ville, livraison, etc.)' })
  platformConfig() {
    return this.adminService.getPlatformConfig();
  }

  @Patch('platform-config')
  @RequirePermissions(AdminPermission.RULES_WRITE)
  @ApiOperation({ summary: 'Modifier configuration plateforme' })
  updatePlatformConfig(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePlatformConfig(body, req.user.role);
  }

  @Get('client-apps-config')
  @RequirePermissions(AdminPermission.SYSTEM_READ)
  @ApiOperation({ summary: 'Config apps (MM + maintenance) — SuperAdmin' })
  clientAppsConfig() {
    return this.adminService.getClientAppsConfig();
  }

  @Patch('client-apps-config')
  @RequirePermissions(AdminPermission.SYSTEM_WRITE)
  @ApiOperation({ summary: 'Modifier config apps (MM + maintenance) — SuperAdmin' })
  updateClientAppsConfig(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    if (body?.sosSms !== undefined && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul le super administrateur peut modifier les SMS des alertes SOS et incidents.');
    }
    if (body?.driverVoice !== undefined && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul le super administrateur peut régler l’écoute vocale de SENGA Driver.');
    }
    if (body?.ai !== undefined && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul le super administrateur peut activer ou couper l’IA.');
    }
    if (body?.languages !== undefined && req.user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Seul le super administrateur peut afficher ou masquer les langues des applications.');
    }
    return this.adminService.updateClientAppsConfig(body);
  }

  @Patch('seat-limits')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Nombre de places par gamme (voiture, Familiale, tricycle) — Admin / Super admin' })
  updateSeatLimits(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    this.assertOpsAdmin(req.user);
    return this.adminService.updateClientAppsConfig({ seatLimits: body ?? {} });
  }

  @Get('platform-vendors')
  @RequirePermissions(AdminPermission.SYSTEM_READ)
  @ApiOperation({ summary: 'Abonnements / hébergements externes — SuperAdmin' })
  listPlatformVendors() {
    return this.adminService.listPlatformVendors();
  }

  @Post('platform-vendors')
  @RequirePermissions(AdminPermission.SYSTEM_WRITE)
  @ApiOperation({ summary: 'Créer abonnement plateforme externe' })
  createPlatformVendor(@Body() body: Record<string, unknown>) {
    return this.adminService.createPlatformVendor(body);
  }

  @Patch('platform-vendors/:id')
  @RequirePermissions(AdminPermission.SYSTEM_WRITE)
  @ApiOperation({ summary: 'Modifier abonnement plateforme externe' })
  updatePlatformVendor(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.adminService.updatePlatformVendor(id, body);
  }

  @Delete('platform-vendors/:id')
  @RequirePermissions(AdminPermission.SYSTEM_WRITE)
  @ApiOperation({ summary: 'Supprimer abonnement plateforme externe' })
  deletePlatformVendor(@Param('id') id: string) {
    return this.adminService.deletePlatformVendor(id);
  }

  @Post('platform-vendors/run-alerts')
  @RequirePermissions(AdminPermission.SYSTEM_WRITE)
  @ApiOperation({ summary: 'Déclencher alertes échéances plateformes' })
  runPlatformVendorAlerts() {
    return this.adminService.runPlatformVendorAlerts();
  }

  @Get('cancellation-policies')
  @RequirePermissions(AdminPermission.RULES_READ)
  @ApiOperation({ summary: 'Politiques annulation courses par type véhicule' })
  cancellationPolicies() {
    return this.adminService.listCancellationPolicies();
  }

  @Patch('cancellation-policies/:vehicleType')
  @RequirePermissions(AdminPermission.RULES_WRITE)
  @ApiOperation({ summary: 'Modifier politique annulation' })
  updateCancellationPolicy(@Request() req: { user: AdminJwtUser }, @Param('vehicleType') vehicleType: string, @Body() body: Record<string, unknown>) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.updateCancellationPolicy(vehicleType, body);
  }

  @Get('parcel-weight-bands')
  @RequirePermissions(AdminPermission.RULES_READ)
  @ApiOperation({ summary: 'Bandes de poids colis et multiplicateurs' })
  parcelWeightBands() {
    return this.adminService.listParcelWeightBands();
  }

  @Patch('parcel-weight-bands/:category')
  @RequirePermissions(AdminPermission.RULES_WRITE)
  @ApiOperation({ summary: 'Modifier bande de poids colis' })
  updateParcelWeightBand(@Request() req: { user: AdminJwtUser }, @Param('category') category: string, @Body() body: Record<string, unknown>) {
    // Nationwide setting: not for a city admin (it would change every city).
    this.assertOpsAdmin(req.user);
    return this.adminService.updateParcelWeightBand(category, body);
  }

  @Get('commissions')
  @RequirePermissions(AdminPermission.PRICING_READ)
  @ApiOperation({ summary: 'Commissions plateforme SENGA par service' })
  commissions() {
    return this.adminService.listCommissions();
  }

  @Patch('commissions/:serviceType')
  @RequirePermissions(AdminPermission.PRICING_WRITE)
  @ApiOperation({ summary: 'Modifier commission plateforme' })
  updateCommission(
    @Request() req: { user: AdminJwtUser },
    @Param('serviceType') serviceType: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.adminService.updateCommission(serviceType, body, req.user.role);
  }

  @Get('promo-codes')
  @RequirePermissions(AdminPermission.PROMO_READ)
  @ApiOperation({ summary: 'Codes promo' })
  promoCodes(@Request() req: { user: AdminJwtUser }) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.listPromoCodesScoped(managedCity);
  }

  @Post('promo-codes')
  @RequirePermissions(AdminPermission.PROMO_WRITE)
  @ApiOperation({ summary: 'Créer code promo' })
  createPromoCode(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.createPromoCode(body, managedCity);
  }

  @Patch('promo-codes/:id')
  @RequirePermissions(AdminPermission.PROMO_WRITE)
  @ApiOperation({ summary: 'Modifier code promo' })
  updatePromoCode(
    @Request() req: { user: AdminJwtUser },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const managedCity = resolveManagedCityScope(req.user);
    return this.adminService.updatePromoCode(id, body, managedCity);
  }

  @Get('subscription-plans')
  @RequirePermissions(AdminPermission.SUBSCRIPTIONS_READ)
  @ApiOperation({ summary: 'Plans abonnement SENGA Plus' })
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

  /* ─── Ops suite (inbox, search, map, audit, blacklist, SLA, P&L, alerts) ─── */

  @Get('inbox')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'File ops unifiée À traiter' })
  async inbox(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    const role = String(req.user?.role ?? '').toUpperCase();
    const canSeeFraud = role === 'SUPER_ADMIN' || role === 'ADMIN';
    const [inbox, fraud] = await Promise.all([
      this.opsService.getInbox(scoped),
      // High-risk fraud alerts still to review (the inbox used to read a field that never existed: always 0).
      canSeeFraud
        ? this.fraudService.getAlerts({ days: 7, autoCreate: false }).catch(() => null)
        : Promise.resolve(null),
    ]);
    if (!fraud) return inbox;
    const items = inbox.items.filter((i) => i.kind !== 'FRAUDE');
    for (const a of fraud.alerts) {
      const reviewed = (a as { reviewed?: boolean }).reviewed === true;
      if (a.severity !== 'HIGH' || reviewed || a.incidentCreated) continue;
      const name = (a as { entityName?: string | null }).entityName;
      items.push({
        id: `fraud-${a.entityType}-${a.entityId}`,
        kind: 'FRAUDE',
        priority: 2,
        title: a.entityType === 'DRIVER' ? 'Fraude possible — chauffeur' : 'Fraude possible — client',
        subtitle: `${name || a.entityId} · score ${a.score}`,
        href: '/fraude',
      });
    }
    items.sort((x, y) => x.priority - y.priority || String(y.createdAt ?? '').localeCompare(String(x.createdAt ?? '')));
    return {
      ...inbox,
      items,
      counts: { ...inbox.counts, total: items.length, fraude: items.filter((i) => i.kind === 'FRAUDE').length },
    };
  }

  @Get('search')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Recherche globale admin' })
  search(@Request() req: { user: AdminJwtUser }, @Query('q') q?: string, @Query('city') city?: string) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.opsService.globalSearch(q ?? '', scoped);
  }

  @Get('fleet-map')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Carte flotte + SOS' })
  fleetMap(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.opsService.fleetMap(scoped);
  }

  @Get('drivers/:userId/score')
  @RequirePermissions(AdminPermission.DRIVERS_READ)
  @ApiOperation({ summary: 'Score chauffeur enrichi' })
  async driverScore(@Request() req: { user: AdminJwtUser }, @Param('userId') userId: string) {
    // CITY_ADMIN: drivers of their city only (getDriver throws otherwise).
    const city = resolveManagedCityScope(req.user);
    if (city) await this.adminService.getDriver(userId, city);
    return this.opsService.driverScore(userId);
  }

  @Get('partner-sla')
  @RequirePermissions(AdminPermission.RESTAURANTS_READ)
  @ApiOperation({ summary: 'SLA partenaires' })
  partnerSla(
    @Request() req: { user: AdminJwtUser },
    @Query('city') city?: string,
    @Query('days') days?: string,
  ) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.opsService.partnerSla(scoped, Number(days ?? 30));
  }

  @Get('pnl')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'P&L / commissions' })
  pnl(
    @Request() req: { user: AdminJwtUser },
    @Query('days') days?: string,
    @Query('city') city?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.opsService.pnl(Number(days ?? 30), scoped, { from, to });
  }

  @Get('audit')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Journal d’audit admin' })
  audit(
    @Request() req: { user: AdminJwtUser },
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // The audit log covers every admin's actions nationwide.
    this.assertOpsAdmin(req.user);
    const qs = new URLSearchParams({ skip: String(skip ?? 0), take: String(take ?? 50) });
    if (actorUserId) qs.set('actorUserId', actorUserId);
    if (action) qs.set('action', action);
    if (resourceType) qs.set('resourceType', resourceType);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return this.opsService.listAudit(qs);
  }

  @Get('blacklist')
  @RequirePermissions(AdminPermission.USERS_READ)
  @ApiOperation({ summary: 'Liste noire' })
  blacklist(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const qs = new URLSearchParams({ skip: String(skip ?? 0), take: String(take ?? 50) });
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    if (activeOnly) qs.set('activeOnly', activeOnly);
    return this.opsService.listBlacklist(qs);
  }

  @Post('blacklist')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Ajouter / mettre à jour entrée liste noire' })
  upsertBlacklist(@Request() req: { user: AdminJwtUser }, @Body() body: Record<string, unknown>) {
    return this.opsService.upsertBlacklist(body, String(req.user.id ?? 'admin'));
  }

  @Post('blacklist/:id/deactivate')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Désactiver entrée liste noire' })
  deactivateBlacklist(@Request() req: { user: AdminJwtUser }, @Param('id') id: string) {
    return this.opsService.deactivateBlacklist(id, String(req.user.id ?? 'admin'));
  }

  @Get('staff-alerts')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Alertes staff' })
  staffAlerts(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('city') city?: string,
  ) {
    const qs = new URLSearchParams({ skip: String(skip ?? 0), take: String(take ?? 50) });
    if (unreadOnly) qs.set('unreadOnly', unreadOnly);
    if (city) qs.set('city', city);
    return this.opsService.listStaffAlerts(qs);
  }

  @Post('staff-alerts/evaluate')
  @RequirePermissions(AdminPermission.METRICS_READ)
  @ApiOperation({ summary: 'Évaluer règles d’alertes proactives' })
  evaluateAlerts(@Request() req: { user: AdminJwtUser }, @Query('city') city?: string) {
    const scoped = resolveManagedCityScope(req.user) ?? city;
    return this.opsService.evaluateAlerts(scoped);
  }

  @Patch('staff-alerts/read-all')
  @RequirePermissions(AdminPermission.METRICS_READ)
  markAllStaffAlertsRead() {
    return this.opsService.markAllStaffAlertsRead();
  }

  @Patch('staff-alerts/:id/read')
  @RequirePermissions(AdminPermission.METRICS_READ)
  markStaffAlertRead(@Param('id') id: string) {
    return this.opsService.markStaffAlertRead(id);
  }

  @Post('bulk/drivers/operating-city')
  @RequirePermissions(AdminPermission.DRIVERS_WRITE)
  @ApiOperation({ summary: 'Bulk: ville d’opération chauffeurs' })
  async bulkDriverCity(
    @Request() req: { user: AdminJwtUser },
    @Body() body: { userIds?: string[]; operatingCity?: string },
  ) {
    const managedCity = resolveManagedCityScope(req.user);
    if (managedCity && (body.operatingCity ?? '').trim().toLowerCase() !== managedCity.toLowerCase()) {
      throw new ForbiddenException('Un administrateur de ville ne peut affecter des chauffeurs qu’à sa ville.');
    }
    const ids = await this.driversInScope(body.userIds ?? [], managedCity);
    return this.opsService.bulkDriverCity(ids, body.operatingCity ?? '', String(req.user.id ?? 'admin'));
  }

  /** Bulk actions: at most 200 accounts, and for a city admin only drivers of their city. */
  private async driversInScope(userIds: string[], managedCity: string | null): Promise<string[]> {
    const ids = [...new Set(userIds.filter((id) => typeof id === 'string' && id))].slice(0, 200);
    if (!managedCity) return ids;
    const checks = await Promise.all(
      ids.map((id) => this.adminService.getDriver(id, managedCity).then(() => id).catch(() => null)),
    );
    return checks.filter((id): id is string => id != null);
  }

  @Post('bulk/kyc/review')
  @RequirePermissions(AdminPermission.KYC_WRITE)
  @ApiOperation({ summary: 'Bulk: revue KYC chauffeurs' })
  async bulkKyc(
    @Request() req: { user: AdminJwtUser },
    @Body() body: { userIds?: string[]; approved?: boolean; notes?: string },
  ) {
    const ids = await this.driversInScope(body.userIds ?? [], resolveManagedCityScope(req.user));
    return this.opsService.bulkKycReview(
      ids,
      body.approved === true,
      body.notes,
      String(req.user.id ?? 'admin'),
    );
  }

  @Post('bulk/users/suspend')
  @RequirePermissions(AdminPermission.USERS_WRITE)
  @ApiOperation({ summary: 'Bulk: suspendre utilisateurs' })
  async bulkSuspend(@Request() req: { user: AdminJwtUser }, @Body() body: { userIds?: string[] }) {
    // Same protections as one by one: never yourself, staff accounts only by a SUPER_ADMIN.
    const actorId = String(req.user.id ?? '');
    const isSuper = String(req.user.role ?? '').toUpperCase() === 'SUPER_ADMIN';
    const ids = [...new Set((body.userIds ?? []).filter((id) => typeof id === 'string' && id && id !== actorId))].slice(0, 200);
    const allowed: string[] = [];
    const skipped: Array<{ userId: string; ok: false; error: string }> = [];
    await Promise.all(
      ids.map(async (id) => {
        const target = (await this.adminService.getUser(id).catch(() => null)) as { role?: string } | null;
        const role = String(target?.role ?? '').toUpperCase();
        const staff = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'FINANCE', 'CONTENT', 'CITY_ADMIN'].includes(role);
        if (!target || (staff && !isSuper)) skipped.push({ userId: id, ok: false, error: 'Compte de l’équipe : réservé au Super admin.' });
        else allowed.push(id);
      }),
    );
    const res = await this.opsService.bulkSuspendUsers(allowed, actorId || 'admin');
    return { results: [...res.results, ...skipped] };
  }
}
