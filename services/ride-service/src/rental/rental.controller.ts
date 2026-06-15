import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateRentalBookingDto,
  CreateRentalInquiryDto,
  RentalEstimateDto,
  RentalQuoteDto,
  RentalVehicleQueryDto,
} from './rental.dto';
import { RentalService } from './rental.service';

@ApiTags('rental')
@Controller('rental')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RentalController {
  constructor(private rentalService: RentalService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Catalogue véhicules avec filtres et tri' })
  vehicles(@Query() query: RentalVehicleQueryDto) {
    return this.rentalService.listVehicles(query);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Détail véhicule et options location' })
  vehicle(@Param('id') id: string) {
    return this.rentalService.getVehicle(id);
  }

  @Post('quote')
  @ApiOperation({ summary: 'Devis location complet (assurance, options, inter-ville)' })
  quote(@Body() dto: RentalQuoteDto) {
    return this.rentalService.quote(dto);
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer location véhicule (alias quote)' })
  estimate(@Body() dto: RentalEstimateDto) {
    return this.rentalService.estimate(dto);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Réserver un véhicule du catalogue' })
  booking(@Request() req: { user: { id: string } }, @Body() dto: CreateRentalBookingDto) {
    return this.rentalService.createBooking(req.user.id, dto);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Mes réservations véhicules' })
  bookings(@Request() req: { user: { id: string } }) {
    return this.rentalService.listBookings(req.user.id);
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Détail réservation véhicule' })
  getBooking(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.rentalService.get(id, req.user.id);
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({ summary: 'Annuler réservation véhicule' })
  cancelBooking(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.rentalService.cancelBooking(id, req.user.id);
  }

  @Post('inquiries')
  @ApiOperation({ summary: 'Soumettre demande de location véhicule' })
  create(@Request() req: { user: { id: string } }, @Body() dto: CreateRentalInquiryDto) {
    return this.rentalService.create(req.user.id, dto);
  }

  @Get('inquiries')
  @ApiOperation({ summary: 'Mes demandes de location' })
  list(@Request() req: { user: { id: string } }) {
    return this.rentalService.list(req.user.id);
  }

  @Get('inquiries/:id')
  @ApiOperation({ summary: 'Détail demande avec timeline statut' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.rentalService.get(id, req.user.id);
  }
}
