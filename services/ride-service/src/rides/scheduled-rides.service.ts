import { HttpStatus, Injectable } from '@nestjs/common';
import { ScheduledRideStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, MOVA_EVENTS, MARKET_RDC, estimateRoadDistanceKm, estimateTripDurationMin, normalizeVehicleType, resolveCityFromCoords, canCancelScheduledRide } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { assertServiceAreaCoords, assertServiceAreaDestination, assertServiceAreaPair, addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { assertDriverCanReceiveJobs, assertDriverEligibleForRide } from '../common/driver-eligibility.util';
import { TripShareService } from '../share/trip-share.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { CreateScheduledRideDto } from './scheduled-rides.dto';
import { MobileScheduledEstimateDto } from '../deliveries/deliveries-mobile.dto';

const MAX_SCHEDULE_DAYS = 7;

@Injectable()
export class ScheduledRidesService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private redis: RedisService,
    private tripShare: TripShareService,
  ) {}

  private parseVehicleType(value: string): VehicleType {
    try {
      return normalizeVehicleType(value) as VehicleType;
    } catch {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Type de véhicule invalide.');
    }
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
    const distanceKm = estimateRoadDistanceKm(this.pricing.haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng));
    const durationMin = estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.ride);
    const city = resolveCityFromCoords(pickup.lat, pickup.lng);
    const vehicleType = this.parseVehicleType(String(dto.vehicleType));
    const fare = await this.pricing.estimateFare(vehicleType, distanceKm, durationMin, city);
    const estimate = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const ride = await this.prisma.scheduledRide.create({
      data: {
        passengerId,
        status: ScheduledRideStatus.SCHEDULED,
        vehicleType,
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
    const rows = await this.prisma.scheduledRide.findMany({
      where: { passengerId, status: { not: ScheduledRideStatus.CANCELLED } },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
    return rows.map((r) => this.formatScheduledForMobile(r));
  }

  private formatScheduledForMobile(ride: {
    id: string;
    passengerId: string;
    driverId: string | null;
    status: ScheduledRideStatus;
    vehicleType: VehicleType;
    scheduledAt: Date;
    pickupAddress: string;
    dropoffAddress: string;
    estimatedPriceCdf: number | null;
    completionPin?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...ride,
      scheduledAt: ride.scheduledAt.toISOString(),
      createdAt: ride.createdAt.toISOString(),
      updatedAt: ride.updatedAt.toISOString(),
      priceCdf: ride.estimatedPriceCdf,
      paymentReady: ride.status === ScheduledRideStatus.COMPLETED,
      completionPin: ride.completionPin ?? undefined,
      ...canCancelScheduledRide({ status: ride.status, scheduledAt: ride.scheduledAt }),
    };
  }

  async get(id: string, passengerId: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    return this.formatScheduledForMobile(ride);
  }

  async getForParticipant(id: string, userId: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return ride;
  }

  async updateStatusByDriver(id: string, driverId: string, status: ScheduledRideStatus) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.driverId !== driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const allowed: Record<ScheduledRideStatus, ScheduledRideStatus[]> = {
      [ScheduledRideStatus.SCHEDULED]: [ScheduledRideStatus.IN_PROGRESS],
      [ScheduledRideStatus.CONFIRMED]: [ScheduledRideStatus.IN_PROGRESS],
      [ScheduledRideStatus.IN_PROGRESS]: [ScheduledRideStatus.COMPLETED],
      [ScheduledRideStatus.COMPLETED]: [],
      [ScheduledRideStatus.CANCELLED]: [],
    };
    if (!allowed[ride.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS);
    }
    if (status === ScheduledRideStatus.IN_PROGRESS) {
      await assertDriverCanReceiveJobs(driverId);
    }
    const updated = await this.prisma.scheduledRide.update({ where: { id }, data: { status } });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'SCHEDULED',
      referenceId: updated.id,
      userId: updated.passengerId,
      status: updated.status,
    });
    return { scheduledRide: updated };
  }

  async cancel(id: string, passengerId: string, reason?: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    const cancelEligibility = canCancelScheduledRide({
      status: ride.status,
      scheduledAt: ride.scheduledAt,
    });
    if (!cancelEligibility.canCancel) {
      throw new MovaHttpException(
        MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS,
        undefined,
        cancelEligibility.cancelBlockReason,
      );
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
    return Promise.all(
      rows.map(async (r) => {
        const passenger = await fetchAuthUserBrief(r.passengerId);
        const driver = r.driverId ? await fetchAuthUserBrief(r.driverId) : null;
        return {
          id: r.id,
          passengerId: r.passengerId,
          passengerName: passenger?.name,
          passengerPhone: passenger?.phone,
          driverId: r.driverId,
          driverName: driver?.name,
          driverPhone: driver?.phone,
          vehicleType: r.vehicleType,
          pickupAddress: r.pickupAddress,
          dropoffAddress: r.dropoffAddress,
          scheduledAt: r.scheduledAt.toISOString(),
          status: r.status,
          priceCdf: r.estimatedPriceCdf,
        };
      }),
    );
  }

  async adminAssignDriver(id: string, driverId: string) {
    if (!driverId?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chauffeur requis.');
    }
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status === ScheduledRideStatus.CANCELLED || ride.status === ScheduledRideStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS);
    }
    await assertDriverEligibleForRide(driverId.trim(), ride.vehicleType);
    const data: { driverId: string; status?: ScheduledRideStatus; completionPin?: string } = {
      driverId: driverId.trim(),
      completionPin: ride.completionPin ?? this.tripShare.generateCompletionPin(),
    };
    if (ride.status === ScheduledRideStatus.SCHEDULED) {
      data.status = ScheduledRideStatus.CONFIRMED;
    }
    const updated = await this.prisma.scheduledRide.update({ where: { id }, data });
    const driver = await fetchAuthUserBrief(updated.driverId!);
    await this.redis.publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
      serviceType: 'SCHEDULED',
      referenceId: updated.id,
      driverId: updated.driverId!,
      passengerId: updated.passengerId,
      summary: `Course planifiée ${updated.pickupAddress ?? ''} → ${updated.dropoffAddress}`,
      pickupAddress: updated.pickupAddress ?? undefined,
      dropoffAddress: updated.dropoffAddress,
      scheduledAt: updated.scheduledAt.toISOString(),
    });
    if (updated.status !== ride.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'SCHEDULED',
        referenceId: updated.id,
        userId: updated.passengerId,
        status: updated.status,
      });
    }
    return {
      id: updated.id,
      driverId: updated.driverId,
      driverName: driver?.name,
      driverPhone: driver?.phone,
      status: updated.status,
    };
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
    const updated = await this.prisma.scheduledRide.update({ where: { id }, data: { status } });
    if (updated.status !== ride.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'SCHEDULED',
        referenceId: updated.id,
        userId: updated.passengerId,
        status: updated.status,
      });
    }
    return updated;
  }

  async listForDriver(driverId: string) {
    const rows = await this.prisma.scheduledRide.findMany({
      where: {
        driverId,
        status: { notIn: [ScheduledRideStatus.CANCELLED, ScheduledRideStatus.COMPLETED] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: 'SCHEDULED',
        label: 'Course planifiée',
        status: r.status,
        pickupAddress: r.pickupAddress,
        dropoffAddress: r.dropoffAddress,
        scheduledAt: r.scheduledAt.toISOString(),
        vehicleType: r.vehicleType,
        priceCdf: r.estimatedPriceCdf,
      })),
    };
  }

  /** Compatibilité mobile — coords pickup/dropoff optionnelles (zones MOVA nationales). */
  async estimateMobile(dto: MobileScheduledEstimateDto) {
    const when = new Date(dto.scheduledAt);
    this.validateScheduledAt(when);
    const vehicleType = this.parseVehicleType(dto.vehicleType);
    const { pickup, dropoff, isInterCity } = this.resolveScheduledCoords(dto);
    const distanceKm = estimateRoadDistanceKm(this.pricing.haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng));
    const durationMin = estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.ride);
    const city = resolveCityFromCoords(pickup.lat, pickup.lng);
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
