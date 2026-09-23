import { HttpStatus, Injectable } from '@nestjs/common';
import {
  RideSharePassengerStatus,
  RideStatus,
  VehicleType,
} from '@prisma/client';
import {
  estimateTripDurationMin,
  formatCdf,
  MovaErrorCode,
  MovaHttpException,
  MOVA_EVENTS,
  type RideCreatedPayload,
  RedisService,
} from '@mova/shared';
import { assertServiceAreaPair } from '../common/address.util';
import { applyPromoCode } from '../common/promo-apply.util';
import { RoutingService } from '../geo/routing.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TripShareService } from '../share/trip-share.service';
import { PricingService } from './pricing.service';
import { PromoService } from './surcharge.service';

type PoolCoords = { lat: number; lng: number };

@Injectable()
export class RidePoolService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private routing: RoutingService,
    private promo: PromoService,
    private platformConfig: PlatformConfigService,
    private redis: RedisService,
    private tripShare: TripShareService,
  ) {}

  private poolCfg() {
    return this.platformConfig.get().carpool;
  }

  async estimateShared(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType: VehicleType = VehicleType.STANDARD,
    promoCode?: string,
  ) {
    const { pickupArea, isInterCity } = assertServiceAreaPair(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const route = await this.routing.resolveRoadDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const distanceKm = route.distanceKm;
    const etaMinutes =
      route.durationMin ??
      estimateTripDurationMin(distanceKm, this.platformConfig.get().trip.averageSpeedKmh.ride);
    const fare = await this.pricing.estimateFare(vehicleType, distanceKm, etaMinutes, pickupArea.name);
    const base = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const promoApplied = await applyPromoCode(this.promo, base.totalCdf, promoCode, false, {
      context: { serviceType: 'RIDE', city: pickupArea.name },
    });
    const exclusive = promoApplied.estimatedPriceCdf;
    const mult = this.poolCfg().fareMultiplier ?? 0.65;
    const sharedFare = Math.max(500, Math.round(exclusive * mult));
    return {
      ...base,
      shared: true,
      exclusiveFareCdf: exclusive,
      estimatedFareCdf: sharedFare,
      totalCdf: sharedFare,
      estimatedPriceCdf: sharedFare,
      formatted: formatCdf(sharedFare),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      fareMultiplier: mult,
      savingsCdf: Math.max(0, exclusive - sharedFare),
      maxPassengers: this.poolCfg().maxPassengers ?? 3,
      maxDetourKm: this.poolCfg().maxDetourKm ?? 2.5,
      distanceKm,
      etaMinutes,
      isInterCity,
      pickupCity: pickupArea.name,
      distanceSource: route.source,
    };
  }

  /**
   * Demande Pool : rejoint une course partagée compatible, sinon crée une nouvelle course isShared.
   */
  async requestShared(
    userId: string,
    data: {
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      vehicleType?: VehicleType;
      pickupAddress?: string;
      dropoffAddress?: string;
      promoCode?: string;
      seats?: number;
    },
  ) {
    const seats = Math.max(1, Math.min(3, Math.floor(data.seats ?? 1)));
    const vehicleType = data.vehicleType ?? VehicleType.STANDARD;
    if (vehicleType === VehicleType.MOTO_TAXI) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Le covoiturage à la demande n\'est pas disponible en moto-taxi.',
      );
    }

    const activeShare = await this.prisma.rideSharePassenger.findFirst({
      where: {
        userId,
        status: { in: [RideSharePassengerStatus.WAITING, RideSharePassengerStatus.PICKED_UP] },
        ride: { status: { in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS] } },
      },
    });
    if (activeShare) {
      throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);
    }

    const activeSolo = await this.prisma.ride.findFirst({
      where: {
        passengerId: userId,
        isShared: false,
        status: {
          in: [RideStatus.REQUESTED, RideStatus.SEARCHING, RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS],
        },
      },
    });
    if (activeSolo) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);

    assertServiceAreaPair(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);

    const estimate = await this.estimateShared(
      data.pickupLat,
      data.pickupLng,
      data.dropoffLat,
      data.dropoffLng,
      vehicleType,
      data.promoCode,
    );

    const compatible = await this.findCompatibleSharedRide(
      { lat: data.pickupLat, lng: data.pickupLng },
      { lat: data.dropoffLat, lng: data.dropoffLng },
      seats,
      vehicleType,
    );

    if (compatible) {
      const booking = await this.joinSharedRide(compatible.id, userId, {
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        seats,
        fareCdf: estimate.totalCdf,
      });
      const ride = await this.prisma.ride.findUnique({
        where: { id: compatible.id },
        include: { sharePassengers: true },
      });
      return {
        joined: true,
        ride: this.formatSharedRide(ride!),
        booking,
        estimate,
        nextStep: 'Suivez la course partagée (tracking).',
      };
    }

    const maxSeats = this.poolCfg().maxPassengers ?? 3;
    const ride = await this.prisma.ride.create({
      data: {
        passengerId: userId,
        status: RideStatus.REQUESTED,
        vehicleType,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        dropoffAddress: data.dropoffAddress,
        estimatedFareCdf: estimate.totalCdf,
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf ?? undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.etaMinutes,
        isShared: true,
        shareSeatsTotal: maxSeats,
        completionPin: this.tripShare.generateCompletionPin(),
        sharePassengers: {
          create: {
            userId,
            seats,
            pickupLat: data.pickupLat,
            pickupLng: data.pickupLng,
            pickupAddress: data.pickupAddress,
            dropoffLat: data.dropoffLat,
            dropoffLng: data.dropoffLng,
            dropoffAddress: data.dropoffAddress,
            fareCdf: estimate.totalCdf,
            status: RideSharePassengerStatus.WAITING,
          },
        },
      },
      include: { sharePassengers: true },
    });
    await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: 'CREATED_SHARED' } });

    const payload: RideCreatedPayload = {
      rideId: ride.id,
      passengerId: userId,
      vehicleType,
      estimatedFareCdf: estimate.totalCdf,
    };
    await this.redis.publish(MOVA_EVENTS.RIDE_CREATED, payload);

    return {
      joined: false,
      ride: this.formatSharedRide(ride),
      booking: ride.sharePassengers[0],
      estimate,
      nextStep: 'POST /api/rides/:id/search',
    };
  }

  async joinSharedRide(
    rideId: string,
    userId: string,
    data: {
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      pickupAddress?: string;
      dropoffAddress?: string;
      seats: number;
      fareCdf: number;
    },
  ) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { sharePassengers: true },
    });
    if (!ride || !ride.isShared) {
      throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const joinable: RideStatus[] = [
      RideStatus.ACCEPTED,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.IN_PROGRESS,
      RideStatus.SEARCHING,
      RideStatus.REQUESTED,
    ];
    if (!joinable.includes(ride.status)) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    if (ride.sharePassengers.some((p) => p.userId === userId && p.status !== RideSharePassengerStatus.CANCELLED)) {
      throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);
    }
    const used = this.seatsUsed(ride.sharePassengers);
    const total = ride.shareSeatsTotal ?? this.poolCfg().maxPassengers ?? 3;
    if (used + data.seats > total) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.CONFLICT,
        'Plus assez de places sur cette course partagée.',
      );
    }

    const booking = await this.prisma.rideSharePassenger.create({
      data: {
        rideId,
        userId,
        seats: data.seats,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        dropoffAddress: data.dropoffAddress,
        fareCdf: data.fareCdf,
        status: RideSharePassengerStatus.WAITING,
      },
    });
    await this.prisma.rideEvent.create({
      data: {
        rideId,
        event: 'SHARE_PASSENGER_JOINED',
        metadata: { userId, bookingId: booking.id },
      },
    });
    return booking;
  }

  async pickupSharePassenger(rideId: string, bookingId: string, driverUserId: string) {
    const ride = await this.requireDriverSharedRide(rideId, driverUserId);
    const booking = ride.sharePassengers.find((p) => p.id === bookingId);
    if (!booking || booking.status === RideSharePassengerStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.NOT_FOUND, 'Passager introuvable.');
    }
    if (booking.status !== RideSharePassengerStatus.WAITING) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    await this.prisma.rideSharePassenger.update({
      where: { id: bookingId },
      data: { status: RideSharePassengerStatus.PICKED_UP, pickedUpAt: new Date() },
    });
    if (ride.status === RideStatus.ACCEPTED || ride.status === RideStatus.DRIVER_ARRIVED) {
      await this.prisma.ride.update({
        where: { id: rideId },
        data: { status: RideStatus.IN_PROGRESS, startedAt: ride.startedAt ?? new Date() },
      });
    }
    await this.prisma.rideEvent.create({
      data: { rideId, event: 'SHARE_PASSENGER_PICKED_UP', metadata: { bookingId } },
    });
    return this.getSharedRideDetail(rideId);
  }

  async dropoffSharePassenger(rideId: string, bookingId: string, driverUserId: string) {
    const ride = await this.requireDriverSharedRide(rideId, driverUserId);
    const booking = ride.sharePassengers.find((p) => p.id === bookingId);
    if (!booking || booking.status === RideSharePassengerStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.NOT_FOUND, 'Passager introuvable.');
    }
    if (booking.status !== RideSharePassengerStatus.PICKED_UP) {
      throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    }
    await this.prisma.rideSharePassenger.update({
      where: { id: bookingId },
      data: { status: RideSharePassengerStatus.DROPPED_OFF, droppedOffAt: new Date() },
    });
    await this.prisma.rideEvent.create({
      data: { rideId, event: 'SHARE_PASSENGER_DROPPED_OFF', metadata: { bookingId } },
    });

    const refreshed = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { sharePassengers: true },
    });
    const active = (refreshed?.sharePassengers ?? []).filter(
      (p) =>
        p.status === RideSharePassengerStatus.WAITING || p.status === RideSharePassengerStatus.PICKED_UP,
    );
    if (active.length === 0 && refreshed) {
      const totalFare = refreshed.sharePassengers
        .filter((p) => p.status === RideSharePassengerStatus.DROPPED_OFF)
        .reduce((s, p) => s + p.fareCdf, 0);
      await this.prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.COMPLETED,
          completedAt: new Date(),
          finalFareCdf: totalFare || refreshed.estimatedFareCdf,
        },
      });
      await this.prisma.rideEvent.create({ data: { rideId, event: 'COMPLETED' } });
    }
    return this.getSharedRideDetail(rideId);
  }

  async getSharedRideDetail(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { sharePassengers: true },
    });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return this.formatSharedRide(ride);
  }

  async findCompatibleSharedRide(
    pickup: PoolCoords,
    dropoff: PoolCoords,
    seats: number,
    vehicleType: VehicleType,
  ) {
    const maxDetour = this.poolCfg().maxDetourKm ?? 2.5;
    const candidates = await this.prisma.ride.findMany({
      where: {
        isShared: true,
        vehicleType,
        status: {
          in: [
            RideStatus.REQUESTED,
            RideStatus.SEARCHING,
            RideStatus.ACCEPTED,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.IN_PROGRESS,
          ],
        },
      },
      include: { sharePassengers: true },
      take: 40,
      orderBy: { updatedAt: 'desc' },
    });

    let best: (typeof candidates)[0] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const ride of candidates) {
      const used = this.seatsUsed(ride.sharePassengers);
      const total = ride.shareSeatsTotal ?? this.poolCfg().maxPassengers ?? 3;
      if (used + seats > total) continue;

      const points = this.routePoints(ride);
      const pickupDetour = Math.min(...points.map((p) => this.pricing.haversineKm(pickup.lat, pickup.lng, p.lat, p.lng)));
      const dropoffDetour = Math.min(...points.map((p) => this.pricing.haversineKm(dropoff.lat, dropoff.lng, p.lat, p.lng)));
      if (pickupDetour > maxDetour || dropoffDetour > maxDetour) continue;

      // Même sens approximatif : dropoff du candidat plus loin dans la direction du trajet.
      const rideBearing = this.bearing(ride.pickupLat, ride.pickupLng, ride.dropoffLat, ride.dropoffLng);
      const reqBearing = this.bearing(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
      const bearingDelta = Math.abs(this.normalizeAngle(rideBearing - reqBearing));
      if (bearingDelta > 75) continue;

      const score = pickupDetour + dropoffDetour + bearingDelta / 100;
      if (score < bestScore) {
        bestScore = score;
        best = ride;
      }
    }
    return best;
  }

  private seatsUsed(
    passengers: { seats: number; status: RideSharePassengerStatus }[],
  ): number {
    return passengers
      .filter((p) => p.status === RideSharePassengerStatus.WAITING || p.status === RideSharePassengerStatus.PICKED_UP)
      .reduce((s, p) => s + (p.seats ?? 1), 0);
  }

  private routePoints(ride: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    sharePassengers: {
      pickupLat: number;
      pickupLng: number;
      dropoffLat: number;
      dropoffLng: number;
      status: RideSharePassengerStatus;
    }[];
  }): PoolCoords[] {
    const pts: PoolCoords[] = [
      { lat: ride.pickupLat, lng: ride.pickupLng },
      { lat: ride.dropoffLat, lng: ride.dropoffLng },
    ];
    for (const p of ride.sharePassengers) {
      if (p.status === RideSharePassengerStatus.CANCELLED) continue;
      pts.push({ lat: p.pickupLat, lng: p.pickupLng }, { lat: p.dropoffLat, lng: p.dropoffLng });
    }
    return pts;
  }

  private bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lng2 - lng1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  private normalizeAngle(deg: number): number {
    let d = deg % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  private async requireDriverSharedRide(rideId: string, driverUserId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { sharePassengers: true },
    });
    if (!ride || !ride.isShared) {
      throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (ride.driverId !== driverUserId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_FORBIDDEN, HttpStatus.FORBIDDEN);
    }
    return ride;
  }

  formatSharedRide(ride: {
    id: string;
    passengerId: string;
    driverId: string | null;
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
    isShared: boolean;
    shareSeatsTotal: number | null;
    completionPin: string | null;
    sharePassengers: Array<{
      id: string;
      userId: string;
      seats: number;
      pickupLat: number;
      pickupLng: number;
      pickupAddress: string | null;
      dropoffLat: number;
      dropoffLng: number;
      dropoffAddress: string | null;
      fareCdf: number;
      status: RideSharePassengerStatus;
      joinedAt: Date;
      pickedUpAt: Date | null;
      droppedOffAt: Date | null;
    }>;
  }) {
    const active = ride.sharePassengers.filter((p) => p.status !== RideSharePassengerStatus.CANCELLED);
    const seatsUsed = this.seatsUsed(ride.sharePassengers);
    const seatsTotal = ride.shareSeatsTotal ?? this.poolCfg().maxPassengers ?? 3;
    const waypoints: Array<{
      type: 'pickup' | 'dropoff';
      bookingId: string;
      userId: string;
      lat: number;
      lng: number;
      address: string | null;
    }> = [
      ...active
        .filter((p) => p.status === RideSharePassengerStatus.WAITING)
        .map((p) => ({
          type: 'pickup' as const,
          bookingId: p.id,
          userId: p.userId,
          lat: p.pickupLat,
          lng: p.pickupLng,
          address: p.pickupAddress,
        })),
      ...active
        .filter((p) => p.status === RideSharePassengerStatus.PICKED_UP)
        .map((p) => ({
          type: 'dropoff' as const,
          bookingId: p.id,
          userId: p.userId,
          lat: p.dropoffLat,
          lng: p.dropoffLng,
          address: p.dropoffAddress,
        })),
    ];

    return {
      id: ride.id,
      type: 'RIDE_SHARE',
      shared: true,
      isShared: true,
      passengerId: ride.passengerId,
      driverId: ride.driverId,
      status: ride.status,
      vehicleType: ride.vehicleType,
      pickupLat: ride.pickupLat,
      pickupLng: ride.pickupLng,
      pickupAddress: ride.pickupAddress,
      dropoffLat: ride.dropoffLat,
      dropoffLng: ride.dropoffLng,
      dropoffAddress: ride.dropoffAddress,
      estimatedFareCdf: ride.estimatedFareCdf,
      finalFareCdf: ride.finalFareCdf,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      shareSeatsTotal: seatsTotal,
      seatsUsed,
      seatsAvailable: Math.max(0, seatsTotal - seatsUsed),
      passengers: active.map((p) => ({
        id: p.id,
        bookingId: p.id,
        userId: p.userId,
        seats: p.seats,
        fareCdf: p.fareCdf,
        status: p.status,
        pickupLat: p.pickupLat,
        pickupLng: p.pickupLng,
        pickupAddress: p.pickupAddress,
        dropoffLat: p.dropoffLat,
        dropoffLng: p.dropoffLng,
        dropoffAddress: p.dropoffAddress,
        paymentReferenceId: p.id,
        paymentReady: p.status === RideSharePassengerStatus.DROPPED_OFF || ride.status === RideStatus.COMPLETED,
      })),
      waypoints,
      completionPin: ride.completionPin,
    };
  }
}
