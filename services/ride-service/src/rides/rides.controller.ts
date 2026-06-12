import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelRideDto, CreateRideDto, EstimateRideDto, UpdateRideStatusDto } from './rides.dto';
import { RidesService } from './rides.service';

@ApiTags('rides')
@Controller('rides')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RidesController {
  constructor(private ridesService: RidesService) {}
  @Post('estimate') @ApiOperation({ summary: 'Estimer tarif' }) estimate(@Body() dto: EstimateRideDto) { return this.ridesService.estimate(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng, dto.vehicleType); }
  @Post() @ApiOperation({ summary: 'Créer une course' }) create(@Request() req: { user: { id: string } }, @Body() dto: CreateRideDto) { return this.ridesService.createRide(req.user.id, dto); }
  @Get() @ApiOperation({ summary: 'Historique courses' }) list(@Request() req: { user: { id: string; role: string } }, @Query('role') role?: string) { return this.ridesService.getUserRides(req.user.id, (role === 'driver' ? 'driver' : 'passenger') as 'passenger' | 'driver'); }
  @Get(':id') @ApiOperation({ summary: 'Détail course' }) get(@Param('id') id: string) { return this.ridesService.getRide(id); }
  @Post(':id/search') @ApiOperation({ summary: 'Rechercher chauffeurs' }) search(@Request() req: { user: { id: string } }, @Param('id') id: string) { return this.ridesService.searchDrivers(id, req.user.id); }
  @Post(':id/accept') @ApiOperation({ summary: 'Accepter course (chauffeur)' }) accept(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body('vehicleId') vehicleId?: string) { return this.ridesService.acceptRide(id, req.user.id, vehicleId); }
  @Patch(':id/status') @ApiOperation({ summary: 'Mettre à jour statut' }) status(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: UpdateRideStatusDto) { return this.ridesService.updateStatus(id, dto.status, req.user.id); }
  @Post(':id/cancel') @ApiOperation({ summary: 'Annuler course' }) cancel(@Request() req: { user: { id: string } }, @Param('id') id: string, @Body() dto: CancelRideDto) { return this.ridesService.cancelRide(id, req.user.id, dto.reason); }
}
