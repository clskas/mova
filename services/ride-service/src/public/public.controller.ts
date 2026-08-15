import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingReferenceType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { HttpStatus } from '@nestjs/common';
import { toMobileRideStatus } from '@mova/shared';
import { TrackingService } from '../tracking/tracking.service';
import { buildMobileAppVersionResponse } from './app-version';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private prisma: PrismaService, private tracking: TrackingService) {}

  @Get('app-version')
  @ApiOperation({ summary: 'Versions courantes / minimales (apps mobiles + web)' })
  getAppVersion() {
    return buildMobileAppVersionResponse();
  }

  @Get('trips/:token')
  @ApiOperation({ summary: 'Suivi trajet public (lien partagé, sans auth)' })
  async getSharedTrip(@Param('token') token: string) {
    const link = await this.prisma.tripShareLink.findUnique({ where: { token } });
    if (!link || link.expiresAt < new Date()) {
      throw new MovaHttpException(MovaErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Lien expiré ou invalide.');
    }
    const ride = await this.prisma.ride.findUnique({ where: { id: link.rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);

    const trace = await this.tracking.getTrace(TrackingReferenceType.RIDE, ride.id);
    const lastPoint = trace.length ? trace[trace.length - 1] : null;

    return {
      status: toMobileRideStatus(ride.status),
      pickupAddress: ride.pickupAddress,
      dropoffAddress: ride.dropoffAddress,
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      lastLocation: lastPoint ? { lat: lastPoint.lat, lng: lastPoint.lng, recordedAt: lastPoint.recordedAt } : null,
      trace: trace.map((p) => ({ lat: p.lat, lng: p.lng })),
      expiresAt: link.expiresAt.toISOString(),
      anonymized: true,
    };
  }
}
