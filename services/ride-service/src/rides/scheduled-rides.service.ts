import { HttpStatus, Injectable } from '@nestjs/common';
import { ScheduledRideStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, findServiceAreaByCoords, MARKET_RDC } from '@mova/shared';
import { assertServiceAreaCoords, assertServiceAreaDestination, assertServiceAreaPair, addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { CreateScheduledRideDto } from './scheduled-rides.dto';
import { MobileScheduledEstimateDto } from '../deliveries/deliveries-mobile.dto';

const MAX_SCHEDULE_DAYS = 7;

@Injectable()
export class ScheduledRidesService {
  constructor(private prisma: PrismaService, private pricing: PricingService) {}

  private parseVehicleType(value: string): VehicleType {
    if (!Object.values(VehicleType).includes(value as VehicleType)) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Type de véhicule invalide.');
    }
    return value as VehicleType;
  }

  private resolveScheduledCoords(dto: {
    pickupLat?: number;
    pickupLng?: number;
    dropoffLat?: number;
    dropoffLng?: number;
    dropoffAddress: string;
  }) {
    const pickup = {
      lat: dto.pickupLat ?? DEFAULT_PICKUP.lat,
      lng: dto.pickupLng ?? DEFAULT_PICKUP.lng,
    };
    assertServiceAreaCoords(pickup.lat, pickup.lng);
    assertServiceAreaDestination(dto.dropoffAddress, {
      lat: dto.dropoffLat,
      lng: dto.dropoffLng,
    });
    const dropoff =
      dto.dropoffLat != null && dto.dropoffLng != null
        ? { lat: dto.dropoffLat, lng: dto.dropoffLng }
        : addressToCoords(dto.dropoffAddress);
    const { isInterCity } = assertServiceAreaPair(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    return { pickup, dropoff, isInterCity };
  }

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
    const { pickup, dropoff, isInterCity } = this.resolveScheduledCoords({
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropoffLat: dto.dropoffLat,
      dropoffLng: dto.dropoffLng,
      dropoffAddress: dto.dropoffAddress ?? '',
    });
    const distanceKm = this.pricing.haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const durationMin = (distanceKm / 25) * 60;
    const city = findServiceAreaByCoords(pickup.lat, pickup.lng)?.name ?? MARKET_RDC.defaultCity;
    const fare = await this.pricing.estimateFare(dto.vehicleType, distanceKm, durationMin, city);
    const estimate = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const ride = await this.prisma.scheduledRide.create({
      data: {
        passengerId,
        status: ScheduledRideStatus.SCHEDULED,
        vehicleType: dto.vehicleType,
        scheduledAt,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: dto.pickupAddress,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
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

  async adminCancel(id: string, reason?: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status === ScheduledRideStatus.CANCELLED || ride.status === ScheduledRideStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS);
    }
    return this.prisma.scheduledRide.update({
      where: { id },
      data: { status: ScheduledRideStatus.CANCELLED, cancelledAt: new Date(), cancelReason: reason ?? 'Annulé par administrateur' },
    });
  }

  async adminUpdateStatus(id: string, status: ScheduledRideStatus) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.prisma.scheduledRide.update({ where: { id }, data: { status } });
  }

  /** Compatibilité mobile — coords pickup/dropoff optionnelles (zones MOVA nationales). */
  async estimateMobile(dto: MobileScheduledEstimateDto) {
    const when = new Date(dto.scheduledAt);
    this.validateScheduledAt(when);
    const vehicleType = this.parseVehicleType(dto.vehicleType);
    const { pickup, dropoff, isInterCity } = this.resolveScheduledCoords(dto);
    const distanceKm = this.pricing.haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const durationMin = (distanceKm / 25) * 60;
    const city = findServiceAreaByCoords(pickup.lat, pickup.lng)?.name ?? MARKET_RDC.defaultCity;
    const fare = await this.pricing.estimateFare(vehicleType, distanceKm, durationMin, city);
    const estimate = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    return {
      estimatedPriceCdf: estimate.estimatedFareCdf,
      formatted: estimate.formatted,
      currency: 'CDF',
      distanceKm,
      durationMin,
      isInterCity,
    };
  }
}
