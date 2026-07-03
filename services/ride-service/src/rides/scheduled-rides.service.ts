import { HttpStatus, Injectable } from '@nestjs/common';
import { RideStatus, ScheduledRideStatus, VehicleType } from '@prisma/client';
import { MovaErrorCode, MovaHttpException, MOVA_EVENTS, MARKET_RDC, estimateRoadDistanceKm, estimateTripDurationMin, normalizeVehicleType, resolveCityFromCoords, canCancelScheduledRide, formatCdf } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { assertServiceAreaCoords, assertServiceAreaDestination, assertServiceAreaPair, addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { assertDriverCanReceiveJobs, assertDriverEligibleForRide } from '../common/driver-eligibility.util';
import { debitWallet } from '../common/wallet-hold.util';
import { MatchingService } from '../matching/matching.service';
import { TripShareService } from '../share/trip-share.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { RidesService } from './rides.service';
import { CreateScheduledRideDto } from './scheduled-rides.dto';
import { MobileScheduledEstimateDto } from '../deliveries/deliveries-mobile.dto';
import { applyPromoCode } from '../common/promo-apply.util';
import { PromoService } from './surcharge.service';

const MAX_SCHEDULE_DAYS = 7;
const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

@Injectable()
export class ScheduledRidesService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private redis: RedisService,
    private tripShare: TripShareService,
    private matching: MatchingService,
    private rides: RidesService,
    private promo: PromoService,
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
    const promoApplied = await applyPromoCode(this.promo, estimate.estimatedFareCdf, dto.promoCode, true, {
      context: { serviceType: 'SCHEDULED' },
    });
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
        estimatedPriceCdf: promoApplied.estimatedPriceCdf,
        promoCode: promoApplied.promoCode,
        discountCdf: promoApplied.discountCdf || undefined,
        distanceKm,
        durationMin,
      },
    });
    return { scheduledRide: ride, estimate: { ...estimate, estimatedPriceCdf: promoApplied.estimatedPriceCdf, discountCdf: promoApplied.discountCdf, promoCode: promoApplied.promoCode } };
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
    pickupAddress: string | null;
    dropoffAddress: string | null;
    estimatedPriceCdf: number | null;
    cancellationFeeCdf?: number | null;
    rideId?: string | null;
    completionPin?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const cancelEligibility = canCancelScheduledRide({ status: ride.status, scheduledAt: ride.scheduledAt });
    const hoursUntil = (ride.scheduledAt.getTime() - Date.now()) / MS_HOUR;
    const lateCancel =
      hoursUntil < MARKET_RDC.scheduled.lateCancelHoursBefore &&
      hoursUntil > 0 &&
      ride.status !== ScheduledRideStatus.CANCELLED;
    const potentialFee = lateCancel
      ? Math.round((ride.estimatedPriceCdf ?? 0) * (MARKET_RDC.scheduled.lateCancelFeePct / 100))
      : 0;
    return {
      ...ride,
      scheduledAt: ride.scheduledAt.toISOString(),
      createdAt: ride.createdAt.toISOString(),
      updatedAt: ride.updatedAt.toISOString(),
      priceCdf: ride.estimatedPriceCdf,
      paymentReady: ride.status === ScheduledRideStatus.COMPLETED,
      completionPin: ride.completionPin ?? undefined,
      linkedRideId: ride.rideId ?? undefined,
      lateCancelWarning: lateCancel
        ? `Annulation tardive : frais de ${formatCdf(potentialFee)} (${MARKET_RDC.scheduled.lateCancelFeePct} %).`
        : undefined,
      potentialCancellationFeeCdf: lateCancel ? potentialFee : 0,
      ...cancelEligibility,
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
    const updates: { status: ScheduledRideStatus; rideId?: string } = { status };
    if (status === ScheduledRideStatus.IN_PROGRESS && !ride.rideId) {
      const linked = await this.rides.createScheduledLinkedRide({
        passengerId: ride.passengerId,
        driverId,
        vehicleType: ride.vehicleType,
        pickupLat: ride.pickupLat,
        pickupLng: ride.pickupLng,
        pickupAddress: ride.pickupAddress ?? undefined,
        dropoffLat: ride.dropoffLat,
        dropoffLng: ride.dropoffLng,
        dropoffAddress: ride.dropoffAddress ?? undefined,
        estimatedFareCdf: ride.estimatedPriceCdf,
        distanceKm: ride.distanceKm ?? undefined,
        durationMin: ride.durationMin ?? undefined,
      });
      updates.rideId = linked.id;
    }
    const updated = await this.prisma.scheduledRide.update({ where: { id }, data: updates });
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
    const hoursUntil = (ride.scheduledAt.getTime() - Date.now()) / MS_HOUR;
    let cancellationFeeCdf = 0;
    if (
      hoursUntil < MARKET_RDC.scheduled.lateCancelHoursBefore &&
      hoursUntil > 0 &&
      (ride.status === ScheduledRideStatus.CONFIRMED || ride.driverId)
    ) {
      cancellationFeeCdf = Math.round(
        (ride.estimatedPriceCdf ?? 0) * (MARKET_RDC.scheduled.lateCancelFeePct / 100),
      );
      if (cancellationFeeCdf > 0) {
        await debitWallet(
          passengerId,
          cancellationFeeCdf,
          `Frais annulation tardive course planifiée ${id}`,
          'SCHEDULED',
          id,
        ).catch(() => undefined);
      }
    }
    return this.prisma.scheduledRide.update({
      where: { id },
      data: {
        status: ScheduledRideStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
        cancellationFeeCdf: cancellationFeeCdf || undefined,
      },
    });
  }

  async volunteer(id: string, driverId: string) {
    const ride = await this.prisma.scheduledRide.findUnique({ where: { id } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status === ScheduledRideStatus.CANCELLED || ride.status === ScheduledRideStatus.COMPLETED) {
      throw new MovaHttpException(MovaErrorCode.SCHEDULED_RIDE_INVALID_STATUS);
    }
    await assertDriverEligibleForRide(driverId, ride.vehicleType);
    await this.prisma.scheduledDriverVolunteer.upsert({
      where: { scheduledRideId_driverId: { scheduledRideId: id, driverId } },
      create: { scheduledRideId: id, driverId },
      update: {},
    });
    return { success: true, scheduledRideId: id, driverId };
  }

  async withdrawVolunteer(id: string, driverId: string) {
    await this.prisma.scheduledDriverVolunteer.deleteMany({ where: { scheduledRideId: id, driverId } });
    return { success: true };
  }

  async listVolunteers(id: string) {
    const rows = await this.prisma.scheduledDriverVolunteer.findMany({
      where: { scheduledRideId: id },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      rows.map(async (v) => {
        const driver = await fetchAuthUserBrief(v.driverId);
        return { driverId: v.driverId, driverName: driver?.name, driverPhone: driver?.phone, joinedAt: v.createdAt.toISOString() };
      }),
    );
  }

  async processReminders(): Promise<number> {
    const now = Date.now();
    const dayWindowStart = now + MS_DAY - 30 * 60 * 1000;
    const dayWindowEnd = now + MS_DAY + 30 * 60 * 1000;
    const hourWindowStart = now + MS_HOUR - 10 * 60 * 1000;
    const hourWindowEnd = now + MS_HOUR + 10 * 60 * 1000;

    const candidates = await this.prisma.scheduledRide.findMany({
      where: {
        status: { in: [ScheduledRideStatus.SCHEDULED, ScheduledRideStatus.CONFIRMED] },
        scheduledAt: { gt: new Date(now) },
      },
      take: 100,
    });

    let sent = 0;
    for (const ride of candidates) {
      const at = ride.scheduledAt.getTime();
      const summary = `${ride.pickupAddress ?? 'Départ'} → ${ride.dropoffAddress ?? 'Arrivée'}`;
      const passenger = await fetchAuthUserBrief(ride.passengerId);
      const driver = ride.driverId ? await fetchAuthUserBrief(ride.driverId) : null;

      if (!ride.reminderDayBeforeSentAt && at >= dayWindowStart && at <= dayWindowEnd) {
        await this.publishReminder(ride, 'DAY_BEFORE', summary, passenger?.phone, driver?.phone);
        await this.prisma.scheduledRide.update({
          where: { id: ride.id },
          data: { reminderDayBeforeSentAt: new Date() },
        });
        sent++;
      }
      if (!ride.reminderHourBeforeSentAt && at >= hourWindowStart && at <= hourWindowEnd) {
        await this.publishReminder(ride, 'HOUR_BEFORE', summary, passenger?.phone, driver?.phone);
        await this.prisma.scheduledRide.update({
          where: { id: ride.id },
          data: { reminderHourBeforeSentAt: new Date() },
        });
        sent++;
      }
    }
    return sent;
  }

  private async publishReminder(
    ride: { id: string; passengerId: string; driverId: string | null; scheduledAt: Date },
    reminderKind: 'DAY_BEFORE' | 'HOUR_BEFORE',
    summary: string,
    passengerPhone?: string,
    driverPhone?: string,
  ) {
    await this.redis.publish(MOVA_EVENTS.SCHEDULED_REMINDER, {
      scheduledRideId: ride.id,
      passengerId: ride.passengerId,
      driverId: ride.driverId ?? undefined,
      passengerPhone,
      driverPhone,
      reminderKind,
      scheduledAt: ride.scheduledAt.toISOString(),
      summary,
    });
  }

  async processAutoAssignments(): Promise<number> {
    const now = Date.now();
    const horizonMs = MARKET_RDC.scheduled.autoAssignHoursBefore * MS_HOUR;
    const rides = await this.prisma.scheduledRide.findMany({
      where: {
        status: ScheduledRideStatus.SCHEDULED,
        driverId: null,
        autoAssignAttemptedAt: null,
        scheduledAt: { lte: new Date(now + horizonMs), gt: new Date(now) },
      },
      take: 20,
    });

    let assigned = 0;
    for (const ride of rides) {
      const driverId = await this.pickDriverForAutoAssign(ride);
      await this.prisma.scheduledRide.update({
        where: { id: ride.id },
        data: { autoAssignAttemptedAt: new Date() },
      });
      if (!driverId) continue;
      try {
        await this.adminAssignDriver(ride.id, driverId);
        assigned++;
      } catch {
        // chauffeur indisponible entre-temps
      }
    }
    return assigned;
  }

  private async pickDriverForAutoAssign(ride: {
    id: string;
    pickupLat: number;
    pickupLng: number;
    vehicleType: VehicleType;
  }): Promise<string | null> {
    const volunteers = await this.prisma.scheduledDriverVolunteer.findMany({
      where: { scheduledRideId: ride.id },
      orderBy: { createdAt: 'asc' },
    });
    for (const v of volunteers) {
      try {
        await assertDriverEligibleForRide(v.driverId, ride.vehicleType);
        return v.driverId;
      } catch {
        continue;
      }
    }
    const drivers = await this.matching.findDrivers(ride.pickupLat, ride.pickupLng, ride.vehicleType, 0);
    return drivers[0]?.userId ?? null;
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
    const promoApplied = await applyPromoCode(this.promo, estimate.estimatedFareCdf, dto.promoCode, false, {
      context: { serviceType: 'SCHEDULED' },
    });
    return {
      estimatedPriceCdf: promoApplied.estimatedPriceCdf,
      formatted: formatCdf(promoApplied.estimatedPriceCdf),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      currency: 'CDF',
      distanceKm,
      durationMin,
      isInterCity,
    };
  }
}
