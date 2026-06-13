import { HttpStatus, Injectable } from '@nestjs/common';
import { RideStatus, VehicleType } from '@prisma/client';
import {
  formatCdf,
  fromMobileRideStatus,
  INTERNAL_API_KEY,
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  RideCreatedPayload,
  MARKET_RDC,
  serviceUrl,
  toMobileRideStatus,
  toMobileVehicleType,
  toRideSummary,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { MatchingService } from '../matching/matching.service';

const ACTIVE_STATUSES: RideStatus[] = [
  RideStatus.REQUESTED,
  RideStatus.SEARCHING,
  RideStatus.ACCEPTED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  [RideStatus.REQUESTED]: [RideStatus.SEARCHING, RideStatus.CANCELLED],
  [RideStatus.SEARCHING]: [RideStatus.ACCEPTED, RideStatus.CANCELLED],
  [RideStatus.ACCEPTED]: [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
  [RideStatus.DRIVER_ARRIVED]: [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
  [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.CANCELLED],
  [RideStatus.COMPLETED]: [],
  [RideStatus.CANCELLED]: [],
};

@Injectable()
export class RidesService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private matching: MatchingService,
    private redis: RedisService,
  ) {}

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, vehicleType: VehicleType) {
    const distanceKm = this.pricing.haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const etaMinutes = (distanceKm / 25) * 60;
    return this.pricing.estimateFare(vehicleType, distanceKm, etaMinutes);
  }

  async createRide(
    passengerId: string,
    data: {
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      vehicleType: VehicleType;
      pickupAddress?: string;
      dropoffAddress?: string;
    },
  ) {
    const active = await this.prisma.ride.findFirst({
      where: { passengerId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);

    const estimate = await this.estimate(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng, data.vehicleType);
    const distanceKm = estimate.distanceKm;
    const ride = await this.prisma.ride.create({
      data: {
        passengerId,
        status: RideStatus.REQUESTED,
        vehicleType: data.vehicleType,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        dropoffAddress: data.dropoffAddress,
        estimatedFareCdf: estimate.totalCdf,
        distanceKm,
        durationMin: estimate.etaMinutes,
      },
    });
    await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: 'CREATED' } });

    const payload: RideCreatedPayload = {
      rideId: ride.id,
      passengerId,
      vehicleType: data.vehicleType,
      estimatedFareCdf: estimate.totalCdf,
    };
    await this.redis.publish(MOVA_EVENTS.RIDE_CREATED, payload);

    return {
      ...this.formatRideDetail(ride),
      estimate,
      nextStep: 'POST /api/rides/:id/search',
    };
  }

  async searchDrivers(rideId: string, passengerId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== passengerId) throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    if (ride.status !== RideStatus.REQUESTED && ride.status !== RideStatus.SEARCHING) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }

    if (ride.status === RideStatus.REQUESTED) {
      await this.prisma.ride.update({ where: { id: rideId }, data: { status: RideStatus.SEARCHING } });
      await this.prisma.rideEvent.create({ data: { rideId, event: RideStatus.SEARCHING } });
    }

    const attempts = await this.prisma.rideEvent.count({ where: { rideId, event: 'SEARCH_ATTEMPT' } });
    const drivers = await this.matching.findDrivers(ride.pickupLat, ride.pickupLng, ride.vehicleType, attempts);
    await this.prisma.rideEvent.create({
      data: { rideId, event: 'SEARCH_ATTEMPT', metadata: { attempt: attempts + 1, driversFound: drivers.length } },
    });
    const meta = this.matching.getMatchingMeta(attempts);
    if (drivers.length === 0 && meta.radiusKm >= MARKET_RDC.matching.maxRadiusKm) {
      throw new MovaHttpException(MovaErrorCode.RIDE_NO_DRIVERS);
    }

    return {
      rideId,
      status: toMobileRideStatus(RideStatus.SEARCHING),
      attempt: attempts + 1,
      driversFound: drivers.length,
      ...meta,
      drivers: drivers.map((d) => ({
        driverId: d.driverId,
        userId: d.userId,
        lat: d.lat,
        lng: d.lng,
        rating: d.rating,
        distanceKm: Math.round(d.distanceKm * 100) / 100,
        score: Math.round(d.score * 1000) / 1000,
        vehicleId: d.vehicleId,
      })),
      matchingWeights: MARKET_RDC.matching.scoreWeights,
    };
  }

  async acceptRide(rideId: string, driverUserId: string, vehicleId?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    const updated = await this.prisma.ride.update({
      where: { id: rideId },
      data: { driverId: driverUserId, vehicleId, status: RideStatus.ACCEPTED, acceptedAt: new Date() },
    });
    await this.prisma.rideEvent.create({ data: { rideId, event: RideStatus.ACCEPTED } });
    return this.formatRideDetail(updated);
  }

  async updateStatus(rideId: string, statusInput: string, userId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }

    let status: RideStatus;
    try {
      status = fromMobileRideStatus(statusInput);
    } catch {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }

    const allowed = ALLOWED_TRANSITIONS[ride.status] ?? [];
    if (!allowed.includes(status)) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_TRANSITION);

    const updates: Record<string, unknown> = { status };
    if (status === RideStatus.IN_PROGRESS) updates.startedAt = new Date();
    if (status === RideStatus.COMPLETED) {
      updates.completedAt = new Date();
      updates.finalFareCdf = ride.finalFareCdf ?? ride.estimatedFareCdf;
    }
    if (status === RideStatus.CANCELLED) {
      updates.cancelledAt = new Date();
      updates.cancelledBy = userId;
    }

    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: updates });
    await this.prisma.rideEvent.create({ data: { rideId, event: status } });
    if (status === RideStatus.COMPLETED) {
      await this.redis.publish(MOVA_EVENTS.RIDE_COMPLETED, {
        rideId,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
      });
    }
    const detail = this.formatRideDetail(updated);
    return { ...detail, paymentReady: detail.paymentReady };
  }

  async cancelRide(rideId: string, userId: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }

    const policy = await this.prisma.cancellationPolicy.findUnique({ where: { vehicleType: ride.vehicleType } });
    let feeCdf = 0;
    let feeMessage = 'Annulation gratuite.';
    if (ride.acceptedAt && policy) {
      const minutesSinceAccept = (Date.now() - ride.acceptedAt.getTime()) / 60000;
      if (minutesSinceAccept > policy.freeCancelMinutes) {
        feeCdf = policy.passengerFeeCdf;
        feeMessage = `Frais d'annulation : ${formatCdf(feeCdf)} (après ${policy.freeCancelMinutes} min).`;
      } else {
        feeMessage = `Annulation gratuite dans les ${policy.freeCancelMinutes} premières minutes.`;
      }
    }

    const updated = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: RideStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancelReason: reason,
      },
    });
    await this.prisma.rideEvent.create({ data: { rideId, event: RideStatus.CANCELLED, metadata: { feeCdf, reason } } });

    return {
      ride: this.formatRideDetail(updated),
      cancellationFeeCdf: feeCdf,
      cancellationFeeFormatted: formatCdf(feeCdf),
      message: feeMessage,
    };
  }

  async getRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { events: { orderBy: { createdAt: 'asc' } }, ratings: true },
    });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const driver = ride.driverId ? await this.fetchDriverInfo(ride.driverId) : null;
    const detail = this.formatRideDetail(ride);
    const timeline = this.buildRideTimeline(ride.status, ride.events);
    return {
      ...detail,
      events: ride.events.map((e) => ({ ...e, status: e.event })),
      timeline,
      tracking: timeline,
      ratings: ride.ratings,
      driver,
    };
  }

  private buildRideTimeline(status: RideStatus, events?: { event: string; createdAt: Date }[]) {
    const steps = [
      { key: RideStatus.REQUESTED, label: 'Course demandée' },
      { key: RideStatus.SEARCHING, label: 'Recherche chauffeur' },
      { key: RideStatus.ACCEPTED, label: 'Chauffeur assigné' },
      { key: RideStatus.DRIVER_ARRIVED, label: 'Chauffeur arrivé' },
      { key: RideStatus.IN_PROGRESS, label: 'Course en cours' },
      { key: RideStatus.COMPLETED, label: 'Course terminée' },
    ];
    if (status === RideStatus.CANCELLED) return [{ label: 'Course annulée', done: true }];
    const order = steps.map((s) => s.key);
    const currentIdx = order.indexOf(status);
    return steps.map((step, idx) => {
      const event = events?.find((e) => e.event === step.key);
      return {
        label: step.label,
        done: idx <= currentIdx,
        ...(event ? { at: event.createdAt.toISOString() } : {}),
      };
    });
  }

  async getUserRides(userId: string, role: 'passenger' | 'driver') {
    const rides = await this.prisma.ride.findMany({
      where: role === 'passenger' ? { passengerId: userId } : { driverId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rides.map(toRideSummary);
  }

  private async fetchDriverInfo(userId: string) {
    try {
      const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      const profile = await res.json();
      const vehicle = profile.vehicles?.[0];
      return {
        userId: profile.userId,
        rating: profile.ratingAvg,
        totalRides: profile.totalRides,
        lat: profile.currentLat,
        lng: profile.currentLng,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              type: toMobileVehicleType(vehicle.type),
              make: vehicle.make,
              model: vehicle.model,
              plate: vehicle.plateNumber,
              color: vehicle.color,
            }
          : null,
      };
    } catch {
      return null;
    }
  }

  private formatRideDetail(ride: {
    id: string;
    passengerId: string;
    driverId: string | null;
    vehicleId: string | null;
    status: RideStatus;
    vehicleType: VehicleType;
    pickupLat: number;
    pickupLng: number;
    pickupAddress: string | null;
    dropoffLat: number;
    dropoffLng: number;
    dropoffAddress: string | null;
    estimatedFareCdf: number | null;
    finalFareCdf: number | null;
    distanceKm: number | null;
    durationMin: number | null;
    acceptedAt?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    cancelReason?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const priceCdf = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    const mobileStatus = toMobileRideStatus(ride.status);
    return {
      id: ride.id,
      passengerId: ride.passengerId,
      driverId: ride.driverId,
      vehicleId: ride.vehicleId,
      status: mobileStatus,
      internalStatus: ride.status,
      vehicleType: toMobileVehicleType(ride.vehicleType),
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      pickupAddress: ride.pickupAddress,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      dropoffAddress: ride.dropoffAddress,
      estimatedFareCdf: ride.estimatedFareCdf,
      finalFareCdf: ride.finalFareCdf,
      priceCdf,
      totalCdf: priceCdf,
      totalFormatted: formatCdf(priceCdf),
      distanceKm: ride.distanceKm,
      etaMinutes: ride.durationMin ? Math.ceil(ride.durationMin) : null,
      currency: MARKET_RDC.currency,
      paymentReady: mobileStatus === 'COMPLETED',
      acceptedAt: ride.acceptedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      cancelledAt: ride.cancelledAt,
      cancelReason: ride.cancelReason,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
    };
  }

  async getDriverEarnings(driverUserId: string) {
    const rides = await this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (from: Date) =>
      rides.filter((r) => r.completedAt && r.completedAt >= from).reduce((a, r) => a + (r.finalFareCdf ?? r.estimatedFareCdf ?? 0), 0);
    return {
      totalCdf: sum(new Date(0)),
      todayCdf: sum(startOfDay),
      weekCdf: sum(startOfWeek),
      monthCdf: sum(startOfMonth),
      rideCount: rides.length,
    };
  }

  async getStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [rides, completed, revenue, todayRides, todayCompleted, activeRides, cancelled, todayRevenue] = await Promise.all([
      this.prisma.ride.count(),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED } }),
      this.prisma.ride.aggregate({ where: { status: RideStatus.COMPLETED }, _sum: { finalFareCdf: true, estimatedFareCdf: true } }),
      this.prisma.ride.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.ride.count({ where: { status: RideStatus.COMPLETED, completedAt: { gte: startOfDay } } }),
      this.prisma.ride.count({ where: { status: { in: ACTIVE_STATUSES } } }),
      this.prisma.ride.count({ where: { status: RideStatus.CANCELLED } }),
      this.prisma.ride.aggregate({ where: { status: RideStatus.COMPLETED, completedAt: { gte: startOfDay } }, _sum: { finalFareCdf: true, estimatedFareCdf: true } }),
    ]);
    const revenueCdf = (revenue._sum.finalFareCdf ?? 0) + (revenue._sum.estimatedFareCdf ?? 0);
    const todayRevenueCdf = (todayRevenue._sum.finalFareCdf ?? 0) + (todayRevenue._sum.estimatedFareCdf ?? 0);
    return { rides, completed, revenueCdf, todayRides, todayCompleted, todayRevenueCdf, activeRides, cancelled };
  }

  async listForAdmin(opts: { status?: string; from?: string; to?: string; skip?: number; take?: number }) {
    const where: { status?: RideStatus; createdAt?: { gte?: Date; lte?: Date } } = {};
    if (opts.status) where.status = opts.status as RideStatus;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) where.createdAt.lte = new Date(opts.to);
    }
    const rides = await this.prisma.ride.findMany({
      where,
      skip: opts.skip ?? 0,
      take: opts.take ?? 50,
      orderBy: { createdAt: 'desc' },
    });
    return rides.map((r) => ({
      id: r.id,
      passengerId: r.passengerId,
      driverId: r.driverId,
      status: r.status,
      vehicleType: r.vehicleType,
      pickupAddress: r.pickupAddress,
      dropoffAddress: r.dropoffAddress,
      priceCdf: r.finalFareCdf ?? r.estimatedFareCdf ?? 0,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async adminCancelRide(rideId: string, reason?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status === RideStatus.COMPLETED || ride.status === RideStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    return this.prisma.ride.update({
      where: { id: rideId },
      data: {
        status: RideStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: 'admin',
        cancelReason: reason ?? 'Annulé par administrateur',
      },
    });
  }

  async adminUpdateStatus(rideId: string, status: RideStatus, reason?: string) {
    if (status === RideStatus.CANCELLED) return this.adminCancelRide(rideId, reason);
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updates: Record<string, unknown> = { status };
    if (status === RideStatus.COMPLETED) updates.completedAt = new Date();
    if (status === RideStatus.IN_PROGRESS) updates.startedAt = new Date();
    const updated = await this.prisma.ride.update({ where: { id: rideId }, data: updates });
    await this.prisma.rideEvent.create({ data: { rideId, event: status, metadata: { reason, by: 'ADMIN' } } });
    return { ride: this.formatRideDetail(updated), message: 'Statut mis à jour par l\'administration.' };
  }
}
