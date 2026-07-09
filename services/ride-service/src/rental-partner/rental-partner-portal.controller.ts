import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartnerPromoDto } from '../promo/partner-promo.dto';
import { PartnerPromoService } from '../promo/partner-promo.service';
import { PartnerBillingService } from '../billing/partner-billing.service';
import { CreatePartnerVehicleDto, PartnerBookingActionDto, PartnerConfirmCashDto, PartnerLogisticsDto, UploadPartnerVehiclePhotoDto } from './rental-partner-portal.dto';
import { RentalPartnerPortalService } from './rental-partner-portal.service';
import { RentalPartnerRoleGuard } from './rental-partner-role.guard';

@ApiTags('rental-partner')
@Controller('rental-partner')
@UseGuards(JwtAuthGuard, RentalPartnerRoleGuard)
@ApiBearerAuth()
export class RentalPartnerPortalController {
  constructor(
    private portal: RentalPartnerPortalService,
    private partnerPromo: PartnerPromoService,
    private partnerBilling: PartnerBillingService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Profil partenaire location' })
  profile(@Request() req: { user: { id: string } }) {
    return this.portal.getProfile(req.user.id);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord partenaire location' })
  dashboard(@Request() req: { user: { id: string } }) {
    return this.portal.getDashboard(req.user.id);
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'Mes véhicules soumis' })
  vehicles(
    @Request() req: { user: { id: string } },
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('city') city?: string,
  ) {
    return this.portal.listVehicles(req.user.id, { q, status, city });
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

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Détail véhicule partenaire' })
  getVehicle(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.portal.getVehicle(req.user.id, id);
  }

  @Delete('vehicles/:id')
  @ApiOperation({ summary: 'Retirer un véhicule du catalogue' })
  deleteVehicle(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.portal.deleteVehicle(req.user.id, id);
  }

  @Post('vehicle-photo')
  @ApiOperation({ summary: 'Téléverser photo véhicule (base64)' })
  photo(@Request() req: { user: { id: string } }, @Body() dto: UploadPartnerVehiclePhotoDto) {
    return this.portal.uploadVehiclePhoto(req.user.id, dto.imageBase64, dto.mimeType);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Réservations sur mes véhicules' })
  bookings(
    @Request() req: { user: { id: string } },
    @Query('status') status?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.portal.listBookings(req.user.id, {
      status,
      vehicleId,
      from,
      to,
      q,
      skip: skip != null ? Number(skip) : undefined,
      take: take != null ? Number(take) : undefined,
    });
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Solde et revenus location crédités' })
  earnings(@Request() req: { user: { id: string } }) {
    return this.portal.getEarnings(req.user.id);
  }

  @Get('earnings/report')
  @ApiOperation({ summary: 'Rapport financier filtré (JSON)' })
  earningsReport(
    @Request() req: { user: { id: string } },
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.portal.getEarningsReport(req.user.id, {
      from,
      to,
      q,
      skip: skip != null ? Number(skip) : undefined,
      take: take != null ? Number(take) : undefined,
    });
  }

  @Get('earnings/report/csv')
  @ApiOperation({ summary: 'Rapport financier (CSV)' })
  @ApiProduces('text/csv')
  async earningsReportCsv(
    @Request() req: { user: { id: string } },
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const csv = await this.portal.getEarningsReportCsv(req.user.id, { from, to, q });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mova-location-rapport.csv"');
    res.send(csv);
  }

  @Get('earnings/report/pdf')
  @ApiOperation({ summary: 'Rapport financier (PDF)' })
  @ApiProduces('application/pdf')
  async earningsReportPdf(
    @Request() req: { user: { id: string } },
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const { buffer, filename } = await this.portal.getEarningsReportPdf(req.user.id, { from, to, q });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
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

  @Post('bookings/:id/cash/confirm')
  @ApiOperation({ summary: 'Confirmer paiement espèces avec le PIN passager' })
  confirmCash(
    @Request() req: { user: { id: string }; headers: { authorization?: string } },
    @Param('id') id: string,
    @Body() dto: PartnerConfirmCashDto,
  ) {
    return this.portal.confirmCashPayment(req.user.id, id, dto.pin);
  }

  @Get('promos')
  @ApiOperation({ summary: 'Codes promo du loueur' })
  listPromos(@Request() req: { user: { id: string } }) {
    return this.partnerPromo.listRentalPromos(req.user.id);
  }

  @Post('promos')
  @ApiOperation({ summary: 'Créer un code promo location' })
  createPromo(@Request() req: { user: { id: string } }, @Body() dto: PartnerPromoDto) {
    return this.partnerPromo.createRentalPromo(req.user.id, dto);
  }

  @Patch('promos/:id')
  @ApiOperation({ summary: 'Modifier un code promo location' })
  updatePromo(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: Partial<PartnerPromoDto>,
  ) {
    return this.partnerPromo.updateRentalPromo(req.user.id, id, dto);
  }

  @Get('bookings/:id/receipt')
  @ApiOperation({ summary: 'Reçu partenaire réservation (JSON)' })
  bookingReceipt(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.partnerBilling.buildRentalPartnerReceipt(req.user.id, id);
  }

  @Get('bookings/:id/receipt/pdf')
  @ApiOperation({ summary: 'Reçu partenaire réservation (PDF)' })
  @ApiProduces('application/pdf')
  async bookingReceiptPdf(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.partnerBilling.getRentalPdf(req.user.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
