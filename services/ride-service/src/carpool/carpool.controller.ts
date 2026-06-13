import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MobileCarpoolAddressDto, MobileCarpoolCreateDto, MobileCarpoolEstimateDto } from '../deliveries/deliveries-mobile.dto';
import { CreateCarpoolTripDto, JoinCarpoolDto } from './carpool.dto';
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
  @ApiOperation({ summary: 'Créer trajet covoiturage (contrat mobile)' })
  createRide(@Request() req: { user: { id: string } }, @Body() dto: MobileCarpoolCreateDto) {
    return this.carpoolService.createFromMobile(req.user.id, dto.fromAddress, dto.toAddress, dto.seats ?? 3, dto.departureAt);
  }

  @Post('search')
  @ApiOperation({ summary: 'Rechercher trajets covoiturage (contrat mobile)' })
  search(@Body() dto: MobileCarpoolAddressDto) {
    return this.carpoolService.searchMobile(dto.fromAddress, dto.toAddress);
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer covoiturage (contrat mobile)' })
  estimate(@Body() dto: MobileCarpoolEstimateDto) {
    return this.carpoolService.estimateMobile(dto.fromAddress, dto.toAddress, dto.seats ?? 3);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un trajet covoiturage' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateCarpoolTripDto) {
    return this.carpoolService.create(req.user.id, dto);
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

  @Post(':id/join')
  @ApiOperation({ summary: 'Rejoindre un trajet covoiturage' })
  join(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: JoinCarpoolDto) {
    return this.carpoolService.join(id, req.user.id, dto.seats);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler trajet covoiturage (conducteur)' })
  cancel(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.cancel(id, req.user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Quitter trajet covoiturage (passager)' })
  leave(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.carpoolService.leave(id, req.user.id);
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
