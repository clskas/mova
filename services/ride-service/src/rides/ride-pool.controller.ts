import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EstimateSharedRideDto, RequestSharedRideDto } from './rides.dto';
import { RidePoolService } from './ride-pool.service';

/**
 * Controller dédié — évite les collisions Nest avec `@Get(':id')` / `@Post(':id/…')`
 * sur RidesController (sinon POST …/shared/estimate → 404 « Ressource introuvable »).
 */
@ApiTags('rides-pool')
@Controller('rides/shared')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RidePoolController {
  constructor(private ridePoolService: RidePoolService) {}

  @Post('estimate')
  @ApiOperation({ summary: 'SENGA Pool — estimer tarif partagé (−~35 % vs course seule)' })
  estimateShared(@Body() dto: EstimateSharedRideDto) {
    return this.ridePoolService.estimateShared(
      dto.pickupLat,
      dto.pickupLng,
      dto.dropoffLat,
      dto.dropoffLng,
      dto.vehicleType ?? VehicleType.STANDARD,
      dto.promoCode,
    );
  }

  @Post()
  @ApiOperation({ summary: 'SENGA Pool — demander une course partagée' })
  requestShared(@Request() req: { user: { id: string } }, @Body() dto: RequestSharedRideDto) {
    return this.ridePoolService.requestShared(req.user.id, {
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      vehicleType: dto.vehicleType,
      pickupAddress: dto.pickupAddress,
      dropoffAddress: dto.dropoffAddress,
      promoCode: dto.promoCode,
      seats: dto.seats,
    });
  }
}
