import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionServiceType, DeliveryStatus, DeliveryType, RideStatus, VehicleType } from '@prisma/client';
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
import { CommissionService } from './commission.service';
import { MatchingService } from '../matching/matching.service';
import { computeDriverEta } from '../matching/eta.util';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { assertServiceAreaPair, assertServiceAreaCoords } from '../common/address.util';
import { tripDistanceKm } from '../common/geo.util';

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
    private tracking: TrackingGateway,
    private commission: CommissionService,
  ) {}

  private emitStatusChange(rideId: string, status: RideStatus) {
    this.tracking.broadcastRideStatus(rideId, toMobileRideStatus(status));
  }

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number, vehicleType: VehicleType) {
    const { pickupArea, isInterCity } = assertServiceAreaPair(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const distanceKm = this.pricing.haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const etaMinutes = (distanceKm / 25) * 60;
    const fare = await this.pricing.estimateFare(vehicleType, distanceKm, etaMinutes, pickupArea.name);
    return {
      ...this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm),
      isInterCity,
      pickupCity: pickupArea.name,
    };
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

    assertServiceAreaPair(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);

    const estimate = await this.estimate(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng, data.vehicleType);
    const distanceKm = tripDistanceKm(
      data.pickupLat,
      data.pickupLng,
      data.dropoffLat,
      data.dropoffLng,
      estimate.distanceKm,
    );
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

    const result = await this.runSearchAttempt(ride);
    if (result.driversFound === 0 && result.radiusKm >= MARKET_RDC.matching.maxRadiusKm) {
      throw new MovaHttpException(MovaErrorCode.RIDE_NO_DRIVERS);
    }
    return result;
  }

  /** Recherche automatique (scheduler) — n'échoue pas si aucun chauffeur au rayon max. */
  async autoSearchDrivers(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.status !== RideStatus.SEARCHING) return null;
    return this.runSearchAttempt(ride);
  }

  private async runSearchAttempt(ride: {
    id: string;
    status: RideStatus;
    pickupLat: number;
    pickupLng: number;
    vehicleType: VehicleType;
  }) {
    if (ride.status === RideStatus.REQUESTED) {
      await this.prisma.ride.update({ where: { id: ride.id }, data: { status: RideStatus.SEARCHING } });
      await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: RideStatus.SEARCHING } });
      this.emitStatusChange(ride.id, RideStatus.SEARCHING);
    }

    const attempts = await this.prisma.rideEvent.count({ where: { rideId: ride.id, event: 'SEARCH_ATTEMPT' } });
    const drivers = await this.matching.findDrivers(ride.pickupLat, ride.pickupLng, ride.vehicleType, attempts);
    await this.prisma.rideEvent.create({
      data: { rideId: ride.id, event: 'SEARCH_ATTEMPT', metadata: { attempt: attempts + 1, driversFound: drivers.length } },
    });
    const meta = this.matching.getMatchingMeta(attempts);

    return {
      rideId: ride.id,
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
    this.emitStatusChange(rideId, RideStatus.ACCEPTED);
    return this.formatRideDetail(updated);
  }

  async rejectRide(rideId: string, driverUserId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.SEARCHING) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    await this.prisma.rideEvent.create({
      data: { rideId, event: 'DRIVER_REJECTED', metadata: { driverUserId } },
    });
    return { success: true, rideId };
  }

  async getDriverOffers(driverUserId: string) {
    const profile = await this.fetchDriverProfile(driverUserId);
    if (!profile?.isAvailable || profile.kycStatus !== 'APPROVED') {
      return { offers: [] as Record<string, unknown>[] };
    }
    if (profile.currentLat == null || profile.currentLng == null) {
      return { offers: [] as Record<string, unknown>[] };
    }
    const vehicleTypes = (profile.vehicles ?? [])
      .filter((v: { isActive?: boolean }) => v.isActive !== false)
      .map((v: { type: VehicleType }) => v.type);
    if (vehicleTypes.length === 0) {
      return { offers: [] as Record<string, unknown>[] };
    }

    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.SEARCHING, vehicleType: { in: vehicleTypes } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { events: { where: { event: { in: ['SEARCH_ATTEMPT', 'DRIVER_REJECTED'] } } } },
    });

    const offers = rides
      .filter((ride) => {
        const rejected = ride.events.some(
          (e) => e.event === 'DRIVER_REJECTED' && (e.metadata as { driverUserId?: string })?.driverUserId === driverUserId,
        );
        return !rejected;
      })
      .map((ride) => {
        const attempts = ride.events.filter((e) => e.event === 'SEARCH_ATTEMPT').length;
        const radiusKm = this.matching.computeRadiusKm(attempts > 0 ? attempts - 1 : 0);
        const tripKm = tripDistanceKm(
          ride.pickupLat,
          ride.pickupLng,
          ride.dropoffLat,
          ride.dropoffLng,
          ride.distanceKm,
        );
        const distanceToPickupKm = tripDistanceKm(
          profile.currentLat,
          profile.currentLng,
          ride.pickupLat,
          ride.pickupLng,
        );
        return {
          ...this.formatRideDetail({ ...ride, distanceKm: tripKm }),
          distanceKm: tripKm,
          tripDistanceKm: tripKm,
          distanceToPickupKm,
          searchRadiusKm: radiusKm,
          _withinRadius: distanceToPickupKm <= radiusKm,
        };
      })
      .filter((o) => o._withinRadius)
      .map(({ _withinRadius: _, ...offer }) => offer)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return { offers };
  }

  private async fetchDriverProfile(userId: string) {
    try {
      const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
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
    this.emitStatusChange(rideId, status);
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
    this.emitStatusChange(rideId, RideStatus.CANCELLED);

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
    const trackingEta = this.computeTrackingEta(ride, driver);
    const timeline = this.buildRideTimeline(ride.status, ride.events);
    return {
      ...detail,
      ...trackingEta,
      events: ride.events.map((e) => ({ ...e, status: e.event })),
      timeline,
      tracking: timeline,
      ratings: ride.ratings,
      driver,
    };
  }

  private buildRideTimeline(status: RideStatus, events?: { event: string; createdAt: Date }[]) {
    const steps = [
      { key: RideStatus.SEARCHING, label: 'Recherche' },
      { key: RideStatus.ACCEPTED, label: 'Chauffeur assigné' },
      { key: RideStatus.ACCEPTED, label: 'En route' },
      { key: RideStatus.DRIVER_ARRIVED, label: 'Arrivé' },
      { key: RideStatus.IN_PROGRESS, label: 'En course' },
      { key: RideStatus.COMPLETED, label: 'Terminé' },
    ];
    if (status === RideStatus.CANCELLED) return [{ label: 'Course annulée', done: true }];
    const statusOrder: RideStatus[] = [
      RideStatus.REQUESTED,
      RideStatus.SEARCHING,
      RideStatus.ACCEPTED,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.IN_PROGRESS,
      RideStatus.COMPLETED,
    ];
    const currentIdx = statusOrder.indexOf(status);
    const enRouteIdx = statusOrder.indexOf(RideStatus.ACCEPTED);
    return steps.map((step, idx) => {
      const event = events?.find((e) => e.event === step.key);
      let done = false;
      if (idx === 0) done = currentIdx >= statusOrder.indexOf(RideStatus.SEARCHING);
      else if (idx === 1) done = currentIdx >= enRouteIdx;
      else if (idx === 2) done = currentIdx > enRouteIdx || (currentIdx === enRouteIdx && status === RideStatus.ACCEPTED);
      else if (idx === 3) done = currentIdx >= statusOrder.indexOf(RideStatus.DRIVER_ARRIVED);
      else if (idx === 4) done = currentIdx >= statusOrder.indexOf(RideStatus.IN_PROGRESS);
      else done = currentIdx >= statusOrder.indexOf(RideStatus.COMPLETED);
      return {
        label: step.label,
        done,
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
    const data = rides.map(toRideSummary);
    return { data, rides: data };
  }

  private computeTrackingEta(
    ride: {
      status: RideStatus;
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      driverId: string | null;
      durationMin: number | null;
    },
    driver: { lat?: number | null; lng?: number | null } | null,
  ): { etaMinutes: number | null; driverDistanceKm: number | null } {
    const activeStatuses: RideStatus[] = [RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS];
    if (!ride.driverId || !driver?.lat || !driver?.lng || !activeStatuses.includes(ride.status)) {
      return { etaMinutes: null, driverDistanceKm: null };
    }
    const target =
      ride.status === RideStatus.IN_PROGRESS
        ? { lat: ride.dropoffLat, lng: ride.dropoffLng }
        : { lat: ride.pickupLat, lng: ride.pickupLng };
    const { etaMinutes, driverDistanceKm } = computeDriverEta(driver.lat, driver.lng, target.lat, target.lng);
    return { etaMinutes, driverDistanceKm };
  }

  private async fetchUserBrief(userId: string): Promise<{ name?: string; phone?: string } | null> {
    try {
      const res = await fetch(serviceUrl('auth', `/internal/users/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      const user = (await res.json()) as { firstName?: string; lastName?: string; phone?: string };
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      return { name: name || undefined, phone: user.phone };
    } catch {
      return null;
    }
  }

  private async fetchDriverInfo(userId: string) {
    try {
      const res = await fetch(serviceUrl('driver', `/internal/drivers/${userId}`), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      });
      if (!res.ok) return null;
      const profile = await res.json();
      const user = await this.fetchUserBrief(userId);
      const vehicle = profile.vehicles?.[0];
      const vehicleType = vehicle ? toMobileVehicleType(vehicle.type) : undefined;
      return {
        userId: profile.userId,
        name: user?.name ?? `Chauffeur ${userId.slice(0, 6)}`,
        phone: user?.phone ?? '',
        rating: profile.ratingAvg,
        totalRides: profile.totalRides,
        lat: profile.currentLat,
        lng: profile.currentLng,
        plateNumber: vehicle?.plateNumber,
        vehicleType,
        vehicleModel: vehicle ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : undefined,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              type: vehicleType,
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
    const tripEtaMinutes = ride.durationMin ? Math.ceil(ride.durationMin) : null;
    const resolvedDistanceKm = tripDistanceKm(
      ride.pickupLat,
      ride.pickupLng,
      ride.dropoffLat,
      ride.dropoffLng,
      ride.distanceKm,
    );
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
      distanceKm: resolvedDistanceKm,
      durationMin: tripEtaMinutes,
      etaMinutes: tripEtaMinutes,
      tripEtaMinutes,
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

  private deliveryDriverGross(d: {
    type: DeliveryType;
    finalPriceCdf: number | null;
    estimatedPriceCdf: number | null;
    items: unknown;
  }) {
    const gross = d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0;
    if (d.type !== DeliveryType.FOOD) return gross;
    const items = d.items;
    if (!Array.isArray(items)) return Math.max(3000, gross);
    let itemsTotal = 0;
    for (const entry of items) {
      if (entry && typeof entry === 'object' && 'restaurantId' in entry && Array.isArray((entry as { items?: unknown }).items)) {
        for (const sub of (entry as { items: { unitPriceCdf?: number; priceCdf?: number; quantity?: number }[] }).items) {
          const qty = sub.quantity ?? 1;
          itemsTotal += (sub.unitPriceCdf ?? sub.priceCdf ?? 0) * qty;
        }
      } else {
        const row = entry as { unitPriceCdf?: number; priceCdf?: number; quantity?: number };
        const qty = row.quantity ?? 1;
        itemsTotal += (row.unitPriceCdf ?? row.priceCdf ?? 0) * qty;
      }
    }
    return Math.max(3000, gross - itemsTotal);
  }

  async getRidePayout(rideId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride || ride.status !== RideStatus.COMPLETED || !ride.driverId) {
      return { rideId, driverId: ride?.driverId ?? null, driverNetCdf: 0, grossCdf: 0 };
    }
    const rule = await this.commission.get(CommissionServiceType.RIDE);
    const gross = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    const { driverNetCdf } = this.commission.splitGross(gross, rule.platformPercent);
    return { rideId, driverId: ride.driverId, driverNetCdf, grossCdf: gross };
  }

  async getDriverPayoutItems(driverUserId: string) {
    const [rides, deliveries, rideRule, deliveryRule] = await Promise.all([
      this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } }),
      this.prisma.delivery.findMany({ where: { driverId: driverUserId, status: DeliveryStatus.DELIVERED } }),
      this.commission.get(CommissionServiceType.RIDE),
      this.commission.get(CommissionServiceType.DELIVERY),
    ]);
    const rideNet = (gross: number) => this.commission.splitGross(gross, rideRule.platformPercent).driverNetCdf;
    const deliveryNet = (gross: number) => this.commission.splitGross(gross, deliveryRule.platformPercent).driverNetCdf;

    const items = [
      ...rides.map((r) => ({
        referenceType: 'RIDE',
        referenceId: r.id,
        driverNetCdf: rideNet(r.finalFareCdf ?? r.estimatedFareCdf ?? 0),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      ...deliveries.map((d) => ({
        referenceType: 'DELIVERY',
        referenceId: d.id,
        driverNetCdf: deliveryNet(this.deliveryDriverGross(d)),
        completedAt: d.deliveredAt?.toISOString() ?? null,
      })),
    ];
    return { items };
  }

  async getDriverEarnings(driverUserId: string) {
    const [rides, deliveries, rideRule, deliveryRule] = await Promise.all([
      this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } }),
      this.prisma.delivery.findMany({ where: { driverId: driverUserId, status: DeliveryStatus.DELIVERED } }),
      this.commission.get(CommissionServiceType.RIDE),
      this.commission.get(CommissionServiceType.DELIVERY),
    ]);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const rideNet = (gross: number) => this.commission.splitGross(gross, rideRule.platformPercent).driverNetCdf;
    const deliveryNet = (gross: number) => this.commission.splitGross(gross, deliveryRule.platformPercent).driverNetCdf;

    const sumRides = (from: Date) =>
      rides
        .filter((r) => r.completedAt && r.completedAt >= from)
        .reduce((a, r) => a + rideNet(r.finalFareCdf ?? r.estimatedFareCdf ?? 0), 0);
    const sumDeliveries = (from: Date) =>
      deliveries
        .filter((d) => d.deliveredAt && d.deliveredAt >= from)
        .reduce((a, d) => a + deliveryNet(this.deliveryDriverGross(d)), 0);
    const sumAll = (from: Date) => sumRides(from) + sumDeliveries(from);

    return {
      totalCdf: sumAll(new Date(0)),
      todayCdf: sumAll(startOfDay),
      weekCdf: sumAll(startOfWeek),
      monthCdf: sumAll(startOfMonth),
      rideCount: rides.length,
      deliveryCount: deliveries.length,
      todayRideCount: rides.filter((r) => r.completedAt && r.completedAt >= startOfDay).length,
      todayDeliveryCount: deliveries.filter((d) => d.deliveredAt && d.deliveredAt >= startOfDay).length,
      rideEarningsCdf: sumRides(new Date(0)),
      deliveryEarningsCdf: sumDeliveries(new Date(0)),
      commissionPercent: rideRule.platformPercent,
      deliveryCommissionPercent: deliveryRule.platformPercent,
      currency: 'CDF',
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
