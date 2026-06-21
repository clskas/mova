import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePartnerVehicleDto, PartnerBookingActionDto, PartnerLogisticsDto, UploadPartnerVehiclePhotoDto } from './rental-partner-portal.dto';
import { RentalPartnerPortalService } from './rental-partner-portal.service';
import { RentalPartnerRoleGuard } from './rental-partner-role.guard';

@ApiTags('rental-partner')
@Controller('rental-partner')
@UseGuards(JwtAuthGuard, RentalPartnerRoleGuard)
@ApiBearerAuth()
export class RentalPartnerPortalController {
  constructor(private portal: RentalPartnerPortalService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Profil partenaire location' })
  profile(@Request() req: { user: { id: string } }) {
    return this.portal.getProfile(req.user.id);
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Mes véhicules soumis' })
  vehicles(@Request() req: { user: { id: string } }) {
    return this.portal.listVehicles(req.user.id);
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Soumettre un véhicule (validation admin requise)' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreatePartnerVehicleDto) {
    return this.portal.createVehicle(req.user.id, dto);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Modifier un véhicule en attente' })
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: Partial<CreatePartnerVehicleDto>,
  ) {
    return this.portal.updateVehicle(req.user.id, id, dto);
  }

  @Post('vehicle-photo')
  @ApiOperation({ summary: 'Téléverser photo véhicule (base64)' })
  photo(@Request() req: { user: { id: string } }, @Body() dto: UploadPartnerVehiclePhotoDto) {
    return this.portal.uploadVehiclePhoto(req.user.id, dto.imageBase64, dto.mimeType);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Réservations sur mes véhicules' })
  bookings(@Request() req: { user: { id: string } }) {
    return this.portal.listBookings(req.user.id);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Détail réservation' })
  booking(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.portal.getBooking(req.user.id, id);
  }

  @Patch('bookings/:id')
  @ApiOperation({ summary: 'Confirmer ou refuser une réservation' })
  updateBooking(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: PartnerBookingActionDto,
  ) {
    return this.portal.updateBookingStatus(req.user.id, id, dto.action);
  }

  @Patch('bookings/:id/logistics')
  @ApiOperation({ summary: 'Définir la logistique propriétaire (chauffeur ou remise sur place)' })
  updateLogistics(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: PartnerLogisticsDto,
  ) {
    return this.portal.updateLogistics(req.user.id, id, dto);
  }
}
