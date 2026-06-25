import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProcessPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('rides/unpaid')
  @ApiOperation({ summary: 'Course terminée en attente de paiement (passager)' })
  getUnpaidRide(@Request() req: { user: { id: string } }) {
    return this.paymentsService.findPassengerUnpaidRide(req.user.id);
  }

  @Get('rides/pending-cash')
  @ApiOperation({ summary: 'Course terminée — espèces en attente de PIN (chauffeur)' })
  getDriverPendingCash(@Request() req: { user: { id: string } }) {
    return this.paymentsService.findDriverPendingCashRide(req.user.id);
  }

  @Post('rides/:rideId')
  @ApiOperation({ summary: 'Payer une course' })
  payRide(@Request() req: { user: { id: string } }, @Param('rideId') rideId: string, @Body() dto: ProcessPaymentDto) {
    return this.paymentsService.payRide(rideId, req.user.id, dto.method, dto.phone, dto.amountCdf);
  }

  @Post('rides/:rideId/cash/confirm')
  @ApiOperation({ summary: 'Confirmer paiement espèces (chauffeur + PIN)' })
  confirmCashRide(
    @Request() req: { user: { id: string } },
    @Param('rideId') rideId: string,
    @Body('pin') pin: string,
  ) {
    return this.paymentsService.confirmCashRide(rideId, req.user.id, pin);
  }

  @Post('services/:referenceType/:referenceId/cash/confirm')
  @ApiOperation({ summary: 'Confirmer paiement espèces service (chauffeur + PIN)' })
  confirmCashService(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Body('pin') pin: string,
  ) {
    return this.paymentsService.confirmCashService(referenceType, referenceId, req.user.id, pin);
  }

  @Post('services/:referenceType/:referenceId')
  @ApiOperation({ summary: 'Payer un service terminé (livraison, course, déménagement, location, covoiturage)' })
  payService(
    @Request() req: { user: { id: string } },
    @Param('referenceType') referenceType: string,
    @Param('referenceId') referenceId: string,
    @Body() dto: ProcessPaymentDto,
  ) {
    return this.paymentsService.payService(referenceType, referenceId, req.user.id, dto.method, dto.phone, dto.amountCdf);
  }
}
