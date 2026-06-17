import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MobileCarpoolAddressDto, MobileCarpoolCreateDto, MobileCarpoolEstimateDto } from '../deliveries/deliveries-mobile.dto';
import { BookCarpoolDto, CarpoolSearchQueryDto, CreateCarpoolTripDto, JoinCarpoolDto, RateCarpoolDto } from './carpool.dto';
import { CarpoolService } from './carpool.service';

@ApiTags('carpool')
@Controller('carpool')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CarpoolController {
  constructor(private carpoolService: CarpoolService) {}

  @Get('rides')
  @ApiOperation({ summary: 'Lister trajets covoiturage (contrat mobile)' })
  listRides() {
    return this.carpoolService.listMobileRides();
  }

  @Post('rides')
  @ApiOperation({ summary: 'Créer trajet covoiturage (chauffeur KYC validé uniquement)' })
  createRide(@Request() req: { user: { id: string; role: string } }, @Body() dto: MobileCarpoolCreateDto) {
    return this.carpoolService.createFromMobile(
      req.user.id,
      dto.fromAddress,
      dto.toAddress,
      dto.seats ?? 3,
      dto.departureAt,
      {
        pricePerSeatCdf: dto.pricePerSeatCdf,
        meetingPoint: dto.meetingPoint,
        notes: dto.notes,
        ladiesOnly: dto.ladiesOnly,
        instantBooking: dto.instantBooking,
        vehicleInfo: dto.vehicleInfo,
        actorRole: req.user.role,
      },
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Rechercher trajets par ville et date' })
  searchGet(@Query() query: CarpoolSearchQueryDto) {
    return this.carpoolService.search({
      from: query.from,
      to: query.to,
      date: query.date,
      sort: query.sort,
    });
  }

  @Post('search')
  @ApiOperation({ summary: 'Rechercher trajets covoiturage (contrat mobile)' })
  searchPost(@Body() dto: MobileCarpoolAddressDto & { date?: string; sort?: 'price' | 'departure' | 'rating' }) {
    return this.carpoolService.searchMobile(dto.fromAddress, dto.toAddress, dto.date, dto.sort);
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer covoiturage (chauffeur KYC validé uniquement)' })
  async estimate(@Request() req: { user: { id: string; role: string } }, @Body() dto: MobileCarpoolEstimateDto) {
    await this.carpoolService.assertCanPublishCarpool(req.user.id, req.user.role);
    return this.carpoolService.estimateMobile(dto.fromAddress, dto.toAddress, dto.seats ?? 3);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un trajet covoiturage (chauffeur KYC validé uniquement)' })
  create(@Request() req: { user: { id: string; role: string } }, @Body() dto: CreateCarpoolTripDto) {
    return this.carpoolService.create(req.user.id, dto, req.user.role);
  }

  @Get()
  @ApiOperation({ summary: 'Lister trajets covoiturage (matching stub)' })
  list(
    @Query('pickupLat') pickupLat?: string,
    @Query('pickupLng') pickupLng?: string,
    @Query('dropoffLat') dropoffLat?: string,
    @Query('dropoffLng') dropoffLng?: string,
  ) {
    return this.carpoolService.list({
      pickupLat: pickupLat ? parseFloat(pickupLat) : undefined,
      pickupLng: pickupLng ? parseFloat(pickupLng) : undefined,
      dropoffLat: dropoffLat ? parseFloat(dropoffLat) : undefined,
      dropoffLng: dropoffLng ? parseFloat(dropoffLng) : undefined,
    });
  }

  @Get('mine')
  @ApiOperation({ summary: 'Mes trajets covoiturage' })
  mine(@Request() req: { user: { id: string } }) {
    return this.carpoolService.myTrips(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail trajet covoiturage' })
  get(@Param('id') id: string) {
    return this.carpoolService.get(id);
  }

  @Post(':id/book')
  @ApiOperation({ summary: 'Réserver des places sur un trajet' })
  book(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: BookCarpoolDto) {
    return this.carpoolService.book(id, req.user.id, dto.seats);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Rejoindre un trajet covoiturage' })
  join(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: JoinCarpoolDto) {
    return this.carpoolService.join(id, req.user.id, dto.seats);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler trajet (conducteur) ou réservation (passager)' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.cancelTripOrBooking(id, req.user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitter trajet covoiturage (passager)' })
  leave(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.leave(id, req.user.id);
  }

  @Post(':id/rate')
  @ApiOperation({ summary: 'Noter le conducteur après trajet' })
  rate(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: RateCarpoolDto) {
    return this.carpoolService.rateTrip(id, req.user.id, dto.score, dto.comment);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Démarrer trajet covoiturage (conducteur)' })
  start(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.startTrip(id, req.user.id);
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Terminer trajet covoiturage (conducteur, déclenche paiement)' })
  complete(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.completeTrip(id, req.user.id);
  }
}
