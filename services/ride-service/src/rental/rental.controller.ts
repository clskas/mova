import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRentalBookingDto, CreateRentalInquiryDto, RentalEstimateDto } from './rental.dto';
import { RentalService } from './rental.service';

@ApiTags('rental')
@Controller('rental')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RentalController {
  constructor(private rentalService: RentalService) {}

  @Get('vehicles')
  @ApiOperation({ summary: 'Catalogue véhicules location Kinshasa' })
  vehicles() {
    return this.rentalService.listVehicles();
  }

  @Post('estimate')
  @ApiOperation({ summary: 'Estimer location véhicule (CDF)' })
  estimate(@Body() dto: RentalEstimateDto) {
    return this.rentalService.estimate(dto);
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Réserver un véhicule du catalogue' })
  booking(@Request() req: { user: { id: string } }, @Body() dto: CreateRentalBookingDto) {
    return this.rentalService.createBooking(req.user.id, dto);
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
  @ApiOperation({ summary: 'Détail demande de location' })
  get(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.rentalService.get(id, req.user.id);
  }
}
