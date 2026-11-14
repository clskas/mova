import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UploadsService } from '../uploads/uploads.service';
import { VoiceOrderService } from '../geo/voice-order.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduledRideStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CancelRideDto,
  CreateRideDto,
  EstimateRideDto,
  NearbyVehiclesQueryDto,
  UpdateRideStatusDto,
} from './rides.dto';
import { CancelScheduledRideDto, CreateScheduledRideDto } from './scheduled-rides.dto';
import { MobileScheduledEstimateDto } from '../deliveries/deliveries-mobile.dto';
import { ScheduledRidesService } from './scheduled-rides.service';
import { RidesService } from './rides.service';
import { DriverIncentivesService } from './driver-incentives.service';
import { RidePoolService } from './ride-pool.service';
import { RideChatService } from '../chat/ride-chat.service';
import { SendRideChatDto } from '../chat/ride-chat.dto';

@ApiTags('rides')
@Controller('rides')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RidesController {
  constructor(
    private ridesService: RidesService,
    private scheduledRidesService: ScheduledRidesService,
    private rideChatService: RideChatService,
    private ridePoolService: RidePoolService,
    private uploadsService: UploadsService,
    private voiceOrder: VoiceOrderService,
    private incentives: DriverIncentivesService,
  ) {}

  @Get(':id/driver-photo')
  @ApiOperation({ summary: 'Photo du chauffeur (passagers de la course uniquement)' })
  async driverPhoto(@Request() req: { user: { id: string } }, @Param('id') id: string, @Res() res: Response) {
    const source = await this.ridesService.driverPhotoSource(id, req.user.id);
    if (!source) throw new NotFoundException('Photo indisponible');
    if (source.kind === 'url') return res.redirect(source.url);
    return this.uploadsService.serveUploadedFile('kyc', source.filename, res);
  }

  @Post('voice-parse')
  @ApiOperation({ summary: 'Commande vocale : phrase → départ, destination, gamme (le passager confirme ensuite)' })
  voiceParse(@Body() body: { text?: string; city?: string; lat?: number; lng?: number }) {
    return this.voiceOrder.parse(body ?? {});
  }

  @Get('driver/bonus')
  @ApiOperation({ summary: 'Bonus du jour du chauffeur (missions et paliers)' })
  driverBonus(@Request() req: { user: { id: string } }) {
    return this.incentives.bonusProgress(req.user.id);
  }

  @Get('demand-heatmap')
  @ApiOperation({ summary: 'Carte de la demande autour du chauffeur' })
  demandHeatmap(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.incentives.heatmap(Number(lat), Number(lng));
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer tarif (CDF, Kinshasa)' })
  estimate(@Body() dto: EstimateRideDto) {
    return this.ridesService.estimate(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
      dto.vehicleType,
      dto.promoCode,
      false,
      dto.roundTrip === true,
    );
  }

  @Post('scheduled/estimate')
  @ApiOperation({ summary: 'Estimer réservation planifiée (contrat mobile)' })
  estimateScheduled(@Body() dto: MobileScheduledEstimateDto) {
    return this.scheduledRidesService.estimateMobile(dto);
  }

  @Post('scheduled')
  @ApiOperation({ summary: 'Créer réservation planifiée (J+7 max)' })
  createScheduled(@Request() req: { user: { id: string } }, @Body() dto: CreateScheduledRideDto) {
    return this.scheduledRidesService.create(req.user.id, dto);
  }

  @Get('scheduled')
  @ApiOperation({ summary: 'Liste réservations planifiées' })
  listScheduled(@Request() req: { user: { id: string } }) {
    return this.scheduledRidesService.list(req.user.id);
  }

  @Get('scheduled/assignments')
  @ApiOperation({ summary: 'Courses planifiées assignées au chauffeur' })
  listScheduledAssignments(@Request() req: { user: { id: string } }) {
    return this.scheduledRidesService.listForDriver(req.user.id);
  }

  @Get('scheduled/offers')
  @ApiOperation({ summary: 'Créneaux planifiés ouverts — candidature volontaire chauffeur' })
  listScheduledOffers(@Request() req: { user: { id: string } }) {
    return this.scheduledRidesService.listOffersForDriver(req.user.id);
  }

  @Get('scheduled/:id')
  @ApiOperation({ summary: 'Détail réservation planifiée (passager ou chauffeur assigné)' })
  getScheduled(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.scheduledRidesService.getForParticipant(id, req.user.id);
  }

  @Patch('scheduled/:id/driver-status')
  @ApiOperation({ summary: 'Mettre à jour statut course planifiée (chauffeur assigné)' })
  driverScheduledStatus(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body('status') status: ScheduledRideStatus,
  ) {
    return this.scheduledRidesService.updateStatusByDriver(id, req.user.id, status);
  }

  @Post('scheduled/:id/volunteer')
  @ApiOperation({ summary: 'Chauffeur volontaire pour créneau planifié' })
  volunteerScheduled(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.scheduledRidesService.volunteer(id, req.user.id);
  }

  @Post('scheduled/:id/volunteer/withdraw')
  @ApiOperation({ summary: 'Retirer sa candidature volontaire' })
  withdrawVolunteer(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.scheduledRidesService.withdrawVolunteer(id, req.user.id);
  }

  @Post('scheduled/:id/cancel')
  @ApiOperation({ summary: 'Annuler réservation planifiée' })
  cancelScheduled(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: CancelScheduledRideDto) {
    return this.scheduledRidesService.cancel(id, req.user.id, dto.reason);
  }

  @Get('offers')
  @ApiOperation({ summary: 'Courses disponibles pour le chauffeur (statut SEARCHING)' })
  offers(@Request() req: { user: { id: string } }) {
    return this.ridesService.getDriverOffers(req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historique courses passager/chauffeur' })
  history(@Request() req: { user: { id: string } }, @Query('role') role?: string, @Query('before') before?: string) {
    return this.ridesService.getUserRides(
      req.user.id,
      role === 'driver' ? 'driver' : 'passenger',
      before ? new Date(before) : undefined,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Course active du passager (reprise après fermeture)' })
  active(@Request() req: { user: { id: string } }) {
    return this.ridesService.getActiveRide(req.user.id);
  }

  @Get('nearby-vehicles')
  @ApiOperation({ summary: 'Pins véhicules à proximité (filtrés Taxi / Moto)' })
  nearbyVehicles(@Query() q: NearbyVehiclesQueryDto) {
    return this.ridesService.listNearbyVehicles(q.lat, q.lng, q.vehicleType, q.passengerCount);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une course (statut REQUESTED)' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateRideDto) {
    return this.ridesService.createRide(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Historique courses (alias)' })
  list(@Request() req: { user: { id: string } }, @Query('role') role?: string) {
    return this.ridesService.getUserRides(req.user.id, role === 'driver' ? 'driver' : 'passenger');
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Messages chat course (passager / chauffeur)' })
  getChat(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.rideChatService.listMessages(id, req.user.id);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Envoyer un message chat course' })
  sendChat(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: SendRideChatDto) {
    return this.rideChatService.sendMessage(id, req.user.id, dto.text);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail course avec chauffeur si assigné' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ridesService.getRide(id, req.user.id);
  }

  @Post(':id/search')
  @ApiOperation({ summary: 'Lancer matching chauffeurs (2 km + 1 km/30 s)' })
  search(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ridesService.searchDrivers(id, req.user.id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accepter course (chauffeur)' })
  accept(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body('vehicleId') vehicleId?: string) {
    return this.ridesService.acceptRide(id, req.user.id, vehicleId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Refuser course (chauffeur)' })
  reject(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ridesService.rejectRide(id, req.user.id);
  }

  @Post(':id/share-passengers/:bookingId/pickup')
  @ApiOperation({ summary: 'SENGA Pool — chauffeur prend en charge un passager partagé' })
  pickupSharePassenger(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.ridePoolService.pickupSharePassenger(id, bookingId, req.user.id);
  }

  @Post(':id/share-passengers/:bookingId/dropoff')
  @ApiOperation({ summary: 'SENGA Pool — chauffeur dépose un passager partagé' })
  dropoffSharePassenger(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.ridePoolService.dropoffSharePassenger(id, bookingId, req.user.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mettre à jour statut (MATCHING, DRIVER_ASSIGNED, …)' })
  status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateRideStatusDto) {
    return this.ridesService.updateStatus(id, dto.status, req.user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler course (politique PRD §4.4)' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: CancelRideDto) {
    return this.ridesService.cancelRide(id, req.user.id, dto.reason);
  }

  @Post(':id/share-link')
  @ApiOperation({ summary: 'Générer lien de suivi partageable (24 h)' })
  shareLink(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.ridesService.createShareLink(id, req.user.id);
  }
}
