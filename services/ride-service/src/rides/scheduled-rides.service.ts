import { HttpStatus, Injectable } from '@nestjs/common';
import { ScheduledRideStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { CreateScheduledRideDto } from './scheduled-rides.dto';

const MAX_SCHEDULE_DAYS = 7;

@Injectable()
export class ScheduledRidesService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  private validateScheduledAt(scheduledAt: Date) {
    const now = new Date();
    if (scheduledAt <= now) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_PAST);
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + MAX_SCHEDULE_DAYS);
    if (scheduledAt > maxDate) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_TOO_FAR);
  }

  async create(passengerId: string, dto: CreateScheduledRideDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    this.validateScheduledAt(scheduledAt);
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 25) * 60;
    const estimate = await this.pricing.estimateFare(dto.vehicleType, distanceKm, durationMin);
    const ride = await this.prisma.scheduledRide.create({
      data: {
        passengerId,
        status: ScheduledRideStatus.SCHEDULED,
        vehicleType: dto.vehicleType,
        scheduledAt,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        dropoffAddress: dto.dropoffAddress,
        estimatedPriceCdf: estimate.estimatedFareCdf,
        distanceKm,
        durationMin,
      },
    });
    return { scheduledRide: ride, estimate };
  }

  async list(passengerId: string) {
    return this.prisma.scheduledRide.findMany({
      where: { passengerId, status: { not: ScheduledRideStatus.CANCELLED } },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
  }

  async get(id: string, passengerId: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return ride;
  }

  async cancel(id: string, passengerId: string, reason?: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status === ScheduledRideStatus.CANCELLED || ride.status === ScheduledRideStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS);
    }
    return this.prisma.scheduledRide.update({
      where: { id },
      data: { status: ScheduledRideStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason },
    });
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.scheduledRide.findMany({
      where: { status: { not: ScheduledRideStatus.CANCELLED } },
      orderBy: { scheduledAt: 'asc' },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      passengerId: r.passengerId,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      scheduledAt: r.scheduledAt.toISOString(),
      status: r.status,
      priceCdf: r.estimatedPriceCdf,
    }));
  }

  /** Compatibilité mobile: estimer sans coords pickup/dropoff explicites */
  async estimateMobile(dropoffAddress: string, vehicleType: VehicleType, scheduledAt: string) {
    const when = new Date(scheduledAt);
    this.validateScheduledAt(when);
    const dropoff = addressToCoords(dropoffAddress);
    const distanceKm = this.pricing.haversineKm(DEFAULT_PICKUP.lat, DEFAULT_PICKUP.lng, dropoff.lat, dropoff.lng);
    const durationMin = (distanceKm / 25) * 60;
    const estimate = await this.pricing.estimateFare(vehicleType, distanceKm, durationMin);
    return {
      estimatedPriceCdf: estimate.estimatedFareCdf,
      formatted: estimate.formatted,
      currency: 'CDF',
      distanceKm,
      durationMin,
    };
  }
}
