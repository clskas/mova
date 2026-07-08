import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionServiceType, DeliveryStatus, DeliveryType, ErrandOrderStatus, MovingRequestStatus, RentalInquiryStatus, RideStatus, ScheduledRideStatus, TrackingReferenceType, VehicleType } from '@prisma/client';
import {
  formatCdf,
  fromMobileRideStatus,
  canCancelRide,
  INTERNAL_API_KEY,
  MOVA_EVENTS,
  MovaErrorCode,
  MovaHttpException,
  RideCreatedPayload,
  MARKET_RDC,
  estimateTripDurationMin,
  serviceUrl,
  rideTypesDriverCanServe,
  toMobileRideStatus,
  toMobileVehicleType,
  toRideSummary,
  RideStatusSmsPayload,
  DriverJobAlertPayload,
} from '@mova/shared';
import { RedisService } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseOrderPlacedMetadata, computeFoodSettlementPools } from '../deliveries/food-delivery-settlement.util';
import { deliveryDriverGross } from '../deliveries/delivery-driver-gross.util';
import { PricingService } from './pricing.service';
import { CommissionService } from './commission.service';
import { MatchingService } from '../matching/matching.service';
import { computeDriverEta } from '../matching/eta.util';
import { TrackingGateway } from '../websocket/tracking.gateway';
import { TrackingService } from '../tracking/tracking.service';
import { assertServiceAreaPair, assertServiceAreaCoords } from '../common/address.util';
import { tripDistanceKm } from '../common/geo.util';
import { RoutingService } from '../geo/routing.service';
import { assertDriverCanReceiveJobs, assertDriverEligibleForRide, driverCanReceiveJobs, fetchDriverProfileSnapshot } from '../common/driver-eligibility.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { TripShareService } from '../share/trip-share.service';
import { publishDriverJobAlert } from '../common/driver-job-alert.util';
import { fetchRidePaymentStatus, fetchRidePaymentStatuses } from '../common/payment-status.util';
import { applyPromoCode } from '../common/promo-apply.util';
import { PromoService } from './surcharge.service';

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
    private trackingGateway: TrackingGateway,
    private trackingService: TrackingService,
    private commission: CommissionService,
    private tripShare: TripShareService,
    private promo: PromoService,
    private routing: RoutingService,
  ) {}

  private emitStatusChange(rideId: string, status: RideStatus) {
    this.trackingGateway.broadcastRideStatus(rideId, toMobileRideStatus(status));
  }

  async estimate(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
    vehicleType: VehicleType,
    promoCode?: string,
    redeemPromo = false,
  ) {
    const { pickupArea, isInterCity } = assertServiceAreaPair(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const route = await this.routing.resolveRoadDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const distanceKm = route.distanceKm;
    const etaMinutes =
      route.durationMin ?? estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.ride);
    const fare = await this.pricing.estimateFare(vehicleType, distanceKm, etaMinutes, pickupArea.name);
    const base = this.pricing.withInterCitySurcharge(fare, isInterCity, distanceKm);
    const promoApplied = await applyPromoCode(this.promo, base.totalCdf, promoCode, redeemPromo, {
      context: { serviceType: 'RIDE' },
    });
    return {
      ...base,
      estimatedFareCdf: promoApplied.estimatedPriceCdf,
      totalCdf: promoApplied.estimatedPriceCdf,
      estimatedPriceCdf: promoApplied.estimatedPriceCdf,
      formatted: formatCdf(promoApplied.estimatedPriceCdf),
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
      isInterCity,
      pickupCity: pickupArea.name,
      distanceSource: route.source,
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
      promoCode?: string;
    },
  ) {
    const active = await this.prisma.ride.findFirst({
      where: { passengerId, status: { in: ACTIVE_STATUSES } },
    });
    if (active) throw new MovaHttpException(MovaErrorCode.RIDE_ALREADY_ACTIVE);

    await this.assertNoUnpaidCompletedRide(passengerId);

    assertServiceAreaPair(data.pickupLat, data.pickupLng, data.dropoffLat, data.dropoffLng);

    const estimate = await this.estimate(
      data.pickupLat,
      data.pickupLng,
      data.dropoffLat,
      data.dropoffLng,
      data.vehicleType,
      data.promoCode,
      true,
    );
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
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf ?? undefined,
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

  /** Course liée à une réservation planifiée — chauffeur déjà assigné, statut IN_PROGRESS. */
  async createScheduledLinkedRide(data: {
    passengerId: string;
    driverId: string;
    vehicleType: VehicleType;
    pickupLat: number;
    pickupLng: number;
    pickupAddress?: string;
    dropoffLat: number;
    dropoffLng: number;
    dropoffAddress?: string;
    estimatedFareCdf: number;
    distanceKm?: number;
    durationMin?: number;
  }) {
    const completionPin = this.tripShare.generateCompletionPin();
    const ride = await this.prisma.ride.create({
      data: {
        passengerId: data.passengerId,
        driverId: data.driverId,
        status: RideStatus.IN_PROGRESS,
        vehicleType: data.vehicleType,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        dropoffAddress: data.dropoffAddress,
        estimatedFareCdf: data.estimatedFareCdf,
        finalFareCdf: data.estimatedFareCdf,
        distanceKm: data.distanceKm,
        durationMin: data.durationMin,
        acceptedAt: new Date(),
        startedAt: new Date(),
        completionPin,
      },
    });
    await this.prisma.rideEvent.create({ data: { rideId: ride.id, event: RideStatus.IN_PROGRESS } });
    this.emitStatusChange(ride.id, RideStatus.IN_PROGRESS);
    return ride;
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
    pickupAddress?: string | null;
    vehicleType: VehicleType;
    estimatedFareCdf?: number | null;
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
    if (drivers.length > 0) {
      const pickup = ride.pickupAddress?.trim() || 'près de vous';
      const fare = ride.estimatedFareCdf != null ? ` · ${ride.estimatedFareCdf} FC` : '';
      const alert: DriverJobAlertPayload = {
        jobKind: 'RIDE_OFFER',
        referenceId: ride.id,
        driverUserIds: drivers.map((d) => d.userId),
        title: 'Nouvelle course MOVA',
        body: `Course disponible · ${pickup}${fare}`,
        pickupAddress: ride.pickupAddress ?? undefined,
        pickupLat: ride.pickupLat,
        pickupLng: ride.pickupLng,
      };
      await publishDriverJobAlert(this.redis, alert).catch(() => undefined);
    }
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

  private async notifyRideStatusSms(rideId: string, userId: string, status: RideStatus) {
    const user = await fetchAuthUserBrief(userId);
    if (!user?.phone) return;
    const messages: Partial<Record<RideStatus, string>> = {
      [RideStatus.ACCEPTED]: 'MOVA : votre chauffeur a accepté la course.',
      [RideStatus.DRIVER_ARRIVED]: 'MOVA : votre chauffeur est arrivé au point de départ.',
      [RideStatus.IN_PROGRESS]: 'MOVA : votre course est en cours.',
      [RideStatus.COMPLETED]: 'MOVA : course terminée. Merci d\'avoir voyagé avec MOVA.',
    };
    const message = messages[status];
    if (!message) return;
    try {
      await this.redis.publish(MOVA_EVENTS.RIDE_STATUS_SMS, {
        rideId,
        userId,
        phone: user.phone,
        status: toMobileRideStatus(status),
        message,
      } satisfies RideStatusSmsPayload);
    } catch {
      /* non-blocking */
    }
  }

  async createShareLink(rideId: string, userId: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.passengerId !== userId && ride.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const token = this.tripShare.generateToken();
    const link = await this.prisma.tripShareLink.create({
      data: {
        rideId,
        token,
        createdBy: userId,
        expiresAt: this.tripShare.shareExpiresAt(),
      },
    });
    const shareUrl = this.tripShare.buildShareUrl(link.token);
    return { token: link.token, shareUrl, expiresAt: link.expiresAt.toISOString() };
  }

  async acceptRide(rideId: string, driverUserId: string, vehicleId?: string) {
    const ride = await this.prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (ride.status !== RideStatus.SEARCHING) throw new MovaHttpException(MovaErrorCode.RIDE_INVALID_STATUS);
    await assertDriverEligibleForRide(driverUserId, ride.vehicleType);
    const completionPin = this.tripShare.generateCompletionPin();
    const updated = await this.prisma.ride.update({
      where: { id: rideId },
      data: {
        driverId: driverUserId,
        vehicleId,
        status: RideStatus.ACCEPTED,
        acceptedAt: new Date(),
        completionPin,
      },
    });
    await this.prisma.rideEvent.create({ data: { rideId, event: RideStatus.ACCEPTED } });
    this.emitStatusChange(rideId, RideStatus.ACCEPTED);
    await this.notifyRideStatusSms(rideId, ride.passengerId, RideStatus.ACCEPTED);
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
    const profile = await fetchDriverProfileSnapshot(driverUserId);
    if (!profile?.isAvailable || !driverCanReceiveJobs(profile)) {
      return { offers: [] as Record<string, unknown>[], documentsBlocked: profile?.documentsStatus?.canOperate === false };
    }
    if (profile.currentLat == null || profile.currentLng == null) {
      return { offers: [] as Record<string, unknown>[] };
    }
    const vehicleTypes = (profile.vehicles ?? [])
      .filter((v) => v.isActive !== false)
      .map((v) => v.type as VehicleType);
    if (vehicleTypes.length === 0) {
      return { offers: [] as Record<string, unknown>[] };
    }
    const serveableTypes = rideTypesDriverCanServe(vehicleTypes) as VehicleType[];

    const rides = await this.prisma.ride.findMany({
      where: { status: RideStatus.SEARCHING, vehicleType: { in: serveableTypes } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { events: { where: { event: { in: ['SEARCH_ATTEMPT', 'DRIVER_REJECTED'] } } } },
    });

    const rideRule = await this.commission.get(CommissionServiceType.RIDE);

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
        const fare = ride.estimatedFareCdf ?? 0;
        const driverNetCdf = this.commission.splitGross(fare, rideRule.platformPercent).driverNetCdf;
        return {
          ...this.formatRideDetail({ ...ride, distanceKm: tripKm }),
          distanceKm: tripKm,
          tripDistanceKm: tripKm,
          distanceToPickupKm,
          driverNetCdf: Math.round(driverNetCdf),
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
    await this.notifyRideStatusSms(rideId, ride.passengerId, status);
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
    const cancelEligibility = canCancelRide({ status: toMobileRideStatus(ride.status) });
    if (!cancelEligibility.canCancel) {
      throw new MovaHttpException(
        MovaErrorCode.RIDE_INVALID_STATUS,
        undefined,
        cancelEligibility.cancelBlockReason,
      );
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

  /** Course active du passager (REQUESTED → IN_PROGRESS) pour reprise après fermeture de l'app. */
  async getActiveRide(passengerId: string) {
    const ride = await this.prisma.ride.findFirst({
      where: { passengerId, status: { in: ACTIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!ride) return { ride: null };
    return { ride: await this.getRide(ride.id) };
  }

  async getRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { events: { orderBy: { createdAt: 'asc' } }, ratings: true },
    });
    if (!ride) throw new MovaHttpException(MovaErrorCode.RIDE_NOT_FOUND, HttpStatus.NOT_FOUND);
    const driver = ride.driverId ? await this.fetchDriverInfo(ride.driverId) : null;
    const detail = this.formatRideDetail(ride);
    const rideRule = await this.commission.get(CommissionServiceType.RIDE);
    const gross = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
    const driverNetCdf = Math.round(this.commission.splitGross(gross, rideRule.platformPercent).driverNetCdf);
    const payment = await fetchRidePaymentStatus(rideId);
    const trackingEta = this.computeTrackingEta(ride, driver);
    const timeline = this.buildRideTimeline(ride.status, ride.events);
    const gpsTrace = await this.trackingService.getTrace(TrackingReferenceType.RIDE, rideId);
    return {
      ...detail,
      type: 'RIDE',
      passengerTotalCdf: gross,
      driverNetCdf,
      isPaid: payment.isPaid,
      paymentStatus: payment.paymentStatus,
      paymentReady: detail.paymentReady && !payment.isPaid,
      ...trackingEta,
      events: ride.events.map((e) => ({ ...e, status: e.event })),
      timeline,
      tracking: timeline,
      gpsTrace,
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
    const rideRule = role === 'driver' ? await this.commission.get(CommissionServiceType.RIDE) : null;
    const rides = await this.prisma.ride.findMany({
      where: role === 'passenger' ? { passengerId: userId } : { driverId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const data = await Promise.all(
      rides.map(async (ride) => {
        const summary = toRideSummary(ride);
        const driverNetCdf =
          rideRule != null
            ? Math.round(
                this.commission.splitGross(
                  ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0,
                  rideRule.platformPercent,
                ).driverNetCdf,
              )
            : undefined;
        if (ride.status !== RideStatus.COMPLETED) {
          return driverNetCdf != null ? { ...summary, driverNetCdf } : summary;
        }
        const payment = await fetchRidePaymentStatus(ride.id);
        return {
          ...summary,
          ...(driverNetCdf != null ? { driverNetCdf } : {}),
          isPaid: payment.isPaid,
          paymentStatus: payment.paymentStatus,
        };
      }),
    );
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

  private async assertNoUnpaidCompletedRide(passengerId: string) {
    const completed = await this.prisma.ride.findMany({
      where: { passengerId, status: RideStatus.COMPLETED },
      orderBy: { completedAt: 'desc' },
      take: 5,
      select: { id: true },
    });
    for (const ride of completed) {
      const { isPaid } = await fetchRidePaymentStatus(ride.id);
      if (!isPaid) {
        throw new MovaHttpException(MovaErrorCode.RIDE_UNPAID_PENDING, HttpStatus.CONFLICT);
      }
    }
  }

  async findPassengerUnpaidRide(passengerId: string) {
    const rides = await this.prisma.ride.findMany({
      where: { passengerId, status: RideStatus.COMPLETED },
      orderBy: { completedAt: 'desc' },
      take: 5,
    });
    for (const ride of rides) {
      const payment = await fetchRidePaymentStatus(ride.id);
      if (!payment.isPaid) {
        return {
          ride: {
            ...this.formatRideDetail(ride),
            isPaid: false,
            paymentStatus: payment.paymentStatus,
          },
        };
      }
    }
    return { ride: null };
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
    completionPin?: string | null;
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
      isPaid: false,
      acceptedAt: ride.acceptedAt,
      startedAt: ride.startedAt,
      completedAt: ride.completedAt,
      cancelledAt: ride.cancelledAt,
      cancelReason: ride.cancelReason,
      completionPin: ride.completionPin ?? undefined,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt,
      ...canCancelRide({ status: mobileStatus }),
    };
  }

  private deliveryDriverGross(d: {
    type: DeliveryType;
    finalPriceCdf: number | null;
    estimatedPriceCdf: number | null;
    items: unknown;
  }) {
    return deliveryDriverGross(d);
  }

  async getFoodDeliverySettlement(deliveryId: string) {
    const d = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { events: { orderBy: { createdAt: 'asc' } }, restaurant: true },
    });
    const empty = (deliveryType: string | null = null) => ({
      referenceType: 'DELIVERY' as const,
      referenceId: deliveryId,
      deliveryType,
      totalPaidCdf: 0,
      platformFeeCdf: 0,
      driver: null as { userId: string; grossCdf: number; netCdf: number; platformFeeCdf: number } | null,
      restaurants: [] as {
        restaurantId: string;
        ownerUserId: string | null;
        grossCdf: number;
        netCdf: number;
        platformFeeCdf: number;
      }[],
    });
    if (!d) return empty();
    if (d.type !== DeliveryType.FOOD) return empty(d.type);
    if (d.status !== DeliveryStatus.DELIVERED) return empty('FOOD');

    const totalPaidCdf = d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0;
    const metadata = parseOrderPlacedMetadata(d.events);
    const pools = computeFoodSettlementPools({ totalPaidCdf, items: d.items, metadata });
    const [foodRule, deliveryRule] = await Promise.all([
      this.commission.get(CommissionServiceType.FOOD),
      this.commission.get(CommissionServiceType.DELIVERY),
    ]);

    const restaurantIds = [
      ...new Set(
        [...pools.shares.map((s) => s.restaurantId), d.restaurantId].filter((id): id is string => Boolean(id)),
      ),
    ];
    const restaurantRows = restaurantIds.length
      ? await this.prisma.restaurant.findMany({ where: { id: { in: restaurantIds } } })
      : d.restaurant
        ? [d.restaurant]
        : [];

    const restaurants: {
      restaurantId: string;
      ownerUserId: string | null;
      grossCdf: number;
      netCdf: number;
      platformFeeCdf: number;
    }[] = [];
    // Modèle par absorption : la remise est supportée uniquement par la partie qui la finance
    // (restaurant si PARTNER, MOVA si PLATFORM, les deux si SHARED). Le livreur n'absorbe jamais
    // la promo. On part des montants bruts (sans mise à l'échelle proportionnelle) et la commission
    // plateforme est le résidu, garantissant : restaurants + livreur + plateforme = montant payé.
    const partnerDiscount = metadata.partnerDiscountCdf ?? 0;

    for (const share of pools.shares) {
      const restaurantId = share.restaurantId ?? d.restaurantId;
      if (!restaurantId || share.itemsGrossCdf <= 0) continue;
      const row = restaurantRows.find((r) => r.id === restaurantId);
      const gross = share.itemsGrossCdf;
      const split = this.commission.splitGross(gross, foodRule.platformPercent);
      restaurants.push({
        restaurantId,
        ownerUserId: row?.ownerUserId ?? null,
        grossCdf: Math.round(gross),
        netCdf: Math.round(split.driverNetCdf),
        platformFeeCdf: split.platformFeeCdf,
      });
    }

    // La remise partenaire réduit le net du restaurant concerné (imputée au 1er si multi-restaurants).
    if (partnerDiscount > 0 && restaurants.length > 0) {
      const targetId = d.restaurantId ?? restaurants[0]?.restaurantId;
      const target = restaurants.find((r) => r.restaurantId === targetId) ?? restaurants[0];
      target.netCdf = Math.max(0, target.netCdf - partnerDiscount);
    }

    const deliveryGross = pools.deliveryFeeGross;
    const driverSplit = this.commission.splitGross(deliveryGross, deliveryRule.platformPercent);
    const driverNet = Math.round(driverSplit.driverNetCdf);
    const restaurantNetTotal = restaurants.reduce((sum, r) => sum + r.netCdf, 0);
    // Commission plateforme = résidu (absorbe automatiquement une remise PLATFORM/SHARED,
    // car totalPaidCdf est déjà net de la promo tandis que restaurants/livreur sont au brut).
    const platformFeeCdf = Math.max(0, totalPaidCdf - restaurantNetTotal - driverNet);

    return {
      referenceType: 'DELIVERY' as const,
      referenceId: deliveryId,
      deliveryType: 'FOOD' as const,
      totalPaidCdf,
      platformFeeCdf,
      driver: d.driverId
        ? {
            userId: d.driverId,
            grossCdf: Math.round(deliveryGross),
            netCdf: driverNet,
            platformFeeCdf: driverSplit.platformFeeCdf,
          }
        : null,
      restaurants,
    };
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

  async getServicePayout(referenceType: string, referenceId: string) {
    const type = referenceType.toUpperCase();
    switch (type) {
      case 'RIDE':
        return this.getRidePayout(referenceId);
      case 'DELIVERY': {
        const d = await this.prisma.delivery.findUnique({ where: { id: referenceId } });
        if (!d || d.status !== DeliveryStatus.DELIVERED || !d.driverId) {
          return { referenceType: type, referenceId, driverId: d?.driverId ?? null, driverNetCdf: 0 };
        }
        if (d.type === DeliveryType.FOOD) {
          const settlement = await this.getFoodDeliverySettlement(referenceId);
          return {
            referenceType: type,
            referenceId,
            driverId: settlement.driver?.userId ?? d.driverId,
            driverNetCdf: settlement.driver?.netCdf ?? 0,
            grossCdf: settlement.driver?.grossCdf ?? settlement.driver?.netCdf ?? 0,
          };
        }
        const rule = await this.commission.get(CommissionServiceType.DELIVERY);
        const gross = this.deliveryDriverGross(d);
        return {
          referenceType: type,
          referenceId,
          driverId: d.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      case 'ERRAND': {
        const o = await this.prisma.errandOrder.findUnique({ where: { id: referenceId } });
        if (!o || o.status !== ErrandOrderStatus.COMPLETED || !o.driverId) {
          return { referenceType: type, referenceId, driverId: o?.driverId ?? null, driverNetCdf: 0 };
        }
        const rule = await this.commission.get(CommissionServiceType.ERRAND);
        const gross = (o.finalPriceCdf ?? o.estimatedPriceCdf) + (o.purchaseTotalCdf ?? 0);
        return {
          referenceType: type,
          referenceId,
          driverId: o.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      case 'MOVING': {
        const m = await this.prisma.movingRequest.findUnique({ where: { id: referenceId } });
        if (!m || m.status !== MovingRequestStatus.COMPLETED || !m.driverId) {
          return { referenceType: type, referenceId, driverId: m?.driverId ?? null, driverNetCdf: 0 };
        }
        const rule = await this.commission.get(CommissionServiceType.MOVING);
        const gross = m.estimatedPriceCdf;
        return {
          referenceType: type,
          referenceId,
          driverId: m.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      case 'RENTAL': {
        const r = await this.prisma.rentalInquiry.findUnique({
          where: { id: referenceId },
          include: { vehicle: true },
        });
        if (
          !r ||
          !r.driverId ||
          r.logisticsMode !== 'MOVA_DRIVER' ||
          (r.status !== RentalInquiryStatus.RETURNED && r.status !== RentalInquiryStatus.PAID)
        ) {
          return { referenceType: type, referenceId, driverId: r?.driverId ?? null, driverNetCdf: 0 };
        }
        const rule = await this.commission.get(CommissionServiceType.RENTAL);
        const gross = MARKET_RDC.interCity.baseSurchargeCdf * 2;
        return {
          referenceType: type,
          referenceId,
          driverId: r.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      case 'CARPOOL': {
        const booking = await this.prisma.carpoolPassenger.findUnique({
          where: { id: referenceId },
          include: { trip: true },
        });
        const t = booking?.trip ?? (await this.prisma.carpoolTrip.findUnique({ where: { id: referenceId } }));
        if (!t || t.status !== 'COMPLETED' || !t.driverId) {
          return { referenceType: type, referenceId, driverId: t?.driverId ?? null, driverNetCdf: 0 };
        }
        const rule = await this.commission.get(CommissionServiceType.CARPOOL);
        const seats = booking?.seats ?? Math.max(t.seatsTotal - t.seatsAvailable, 1);
        const gross = t.pricePerSeatCdf * seats;
        return {
          referenceType: type,
          referenceId,
          driverId: t.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      case 'SCHEDULED': {
        const s = await this.prisma.scheduledRide.findUnique({ where: { id: referenceId } });
        if (!s || s.status !== ScheduledRideStatus.COMPLETED || !s.driverId) {
          return { referenceType: type, referenceId, driverId: s?.driverId ?? null, driverNetCdf: 0 };
        }
        const rule = await this.commission.get(CommissionServiceType.RIDE);
        const gross = s.estimatedPriceCdf;
        return {
          referenceType: type,
          referenceId,
          driverId: s.driverId,
          driverNetCdf: this.commission.splitGross(gross, rule.platformPercent).driverNetCdf,
          grossCdf: gross,
        };
      }
      default:
        return { referenceType: type, referenceId, driverId: null, driverNetCdf: 0 };
    }
  }

  async getDriverPayoutItems(driverUserId: string) {
    const [rides, deliveries, movings, errands, rentals, carpools, scheduled, rideRule, deliveryRule, movingRule, errandRule, rentalRule, carpoolRule] =
      await Promise.all([
      this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } }),
      this.prisma.delivery.findMany({ where: { driverId: driverUserId, status: DeliveryStatus.DELIVERED } }),
      this.prisma.movingRequest.findMany({ where: { driverId: driverUserId, status: MovingRequestStatus.COMPLETED } }),
      this.prisma.errandOrder.findMany({ where: { driverId: driverUserId, status: ErrandOrderStatus.COMPLETED } }),
      this.prisma.rentalInquiry.findMany({
        where: {
          driverId: driverUserId,
          logisticsMode: 'MOVA_DRIVER',
          status: { in: [RentalInquiryStatus.RETURNED, RentalInquiryStatus.PAID] },
        },
      }),
      this.prisma.carpoolTrip.findMany({ where: { driverId: driverUserId, status: 'COMPLETED' } }),
      this.prisma.scheduledRide.findMany({ where: { driverId: driverUserId, status: ScheduledRideStatus.COMPLETED } }),
      this.commission.get(CommissionServiceType.RIDE),
      this.commission.get(CommissionServiceType.DELIVERY),
      this.commission.get(CommissionServiceType.MOVING),
      this.commission.get(CommissionServiceType.ERRAND),
      this.commission.get(CommissionServiceType.RENTAL),
      this.commission.get(CommissionServiceType.CARPOOL),
    ]);
    const rideNet = (gross: number, pct: number) => this.commission.splitGross(gross, pct).driverNetCdf;

    const items = [
      ...rides.map((r) => ({
        referenceType: 'RIDE',
        referenceId: r.id,
        driverNetCdf: rideNet(r.finalFareCdf ?? r.estimatedFareCdf ?? 0, rideRule.platformPercent),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
      ...deliveries.map((d) => ({
        referenceType: 'DELIVERY',
        referenceId: d.id,
        driverNetCdf: rideNet(this.deliveryDriverGross(d), deliveryRule.platformPercent),
        completedAt: d.deliveredAt?.toISOString() ?? null,
      })),
      ...movings.map((m) => ({
        referenceType: 'MOVING',
        referenceId: m.id,
        driverNetCdf: rideNet(m.estimatedPriceCdf, movingRule.platformPercent),
        completedAt: m.completedAt?.toISOString() ?? null,
      })),
      ...errands.map((e) => ({
        referenceType: 'ERRAND',
        referenceId: e.id,
        driverNetCdf: rideNet((e.finalPriceCdf ?? e.estimatedPriceCdf) + (e.purchaseTotalCdf ?? 0), errandRule.platformPercent),
        completedAt: e.completedAt?.toISOString() ?? null,
      })),
      ...rentals.map((r) => ({
        referenceType: 'RENTAL',
        referenceId: r.id,
        driverNetCdf: rideNet(MARKET_RDC.interCity.baseSurchargeCdf * 2, rentalRule.platformPercent),
        completedAt: r.updatedAt.toISOString(),
      })),
      ...carpools.map((t) => {
        const booked = t.seatsTotal - t.seatsAvailable;
        return {
          referenceType: 'CARPOOL',
          referenceId: t.id,
          driverNetCdf: rideNet(t.pricePerSeatCdf * Math.max(booked, 1), carpoolRule.platformPercent),
          completedAt: t.updatedAt.toISOString(),
        };
      }),
      ...scheduled.map((s) => ({
        referenceType: 'SCHEDULED',
        referenceId: s.id,
        driverNetCdf: rideNet(s.estimatedPriceCdf, rideRule.platformPercent),
        completedAt: s.updatedAt.toISOString(),
      })),
    ];
    return { items };
  }

  async getDriverEarnings(driverUserId: string) {
    const [rides, deliveries, movings, errands, rentals, carpools, scheduled, rideRule, deliveryRule, movingRule, errandRule, rentalRule, carpoolRule] =
      await Promise.all([
      this.prisma.ride.findMany({ where: { driverId: driverUserId, status: RideStatus.COMPLETED } }),
      this.prisma.delivery.findMany({ where: { driverId: driverUserId, status: DeliveryStatus.DELIVERED } }),
      this.prisma.movingRequest.findMany({ where: { driverId: driverUserId, status: MovingRequestStatus.COMPLETED } }),
      this.prisma.errandOrder.findMany({ where: { driverId: driverUserId, status: ErrandOrderStatus.COMPLETED } }),
      this.prisma.rentalInquiry.findMany({
        where: {
          driverId: driverUserId,
          logisticsMode: 'MOVA_DRIVER',
          status: { in: [RentalInquiryStatus.RETURNED, RentalInquiryStatus.PAID] },
        },
      }),
      this.prisma.carpoolTrip.findMany({ where: { driverId: driverUserId, status: 'COMPLETED' } }),
      this.prisma.scheduledRide.findMany({ where: { driverId: driverUserId, status: ScheduledRideStatus.COMPLETED } }),
      this.commission.get(CommissionServiceType.RIDE),
      this.commission.get(CommissionServiceType.DELIVERY),
      this.commission.get(CommissionServiceType.MOVING),
      this.commission.get(CommissionServiceType.ERRAND),
      this.commission.get(CommissionServiceType.RENTAL),
      this.commission.get(CommissionServiceType.CARPOOL),
    ]);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const net = (gross: number, pct: number) => this.commission.splitGross(gross, pct).driverNetCdf;

    const sumRides = (from: Date) =>
      rides
        .filter((r) => r.completedAt && r.completedAt >= from)
        .reduce((a, r) => a + net(r.finalFareCdf ?? r.estimatedFareCdf ?? 0, rideRule.platformPercent), 0);
    const sumDeliveries = (from: Date) =>
      deliveries
        .filter((d) => d.deliveredAt && d.deliveredAt >= from)
        .reduce((a, d) => a + net(this.deliveryDriverGross(d), deliveryRule.platformPercent), 0);
    const sumMovings = (from: Date) =>
      movings
        .filter((m) => m.completedAt && m.completedAt >= from)
        .reduce((a, m) => a + net(m.estimatedPriceCdf, movingRule.platformPercent), 0);
    const sumErrands = (from: Date) =>
      errands
        .filter((e) => e.completedAt && e.completedAt >= from)
        .reduce(
          (a, e) => a + net((e.finalPriceCdf ?? e.estimatedPriceCdf) + (e.purchaseTotalCdf ?? 0), errandRule.platformPercent),
          0,
        );
    const sumRentals = (from: Date) =>
      rentals
        .filter((r) => r.updatedAt >= from)
        .reduce((a, _r) => a + net(MARKET_RDC.interCity.baseSurchargeCdf * 2, rentalRule.platformPercent), 0);
    const sumCarpools = (from: Date) =>
      carpools
        .filter((t) => t.updatedAt >= from)
        .reduce((a, t) => {
          const booked = t.seatsTotal - t.seatsAvailable;
          return a + net(t.pricePerSeatCdf * Math.max(booked, 1), carpoolRule.platformPercent);
        }, 0);
    const sumScheduled = (from: Date) =>
      scheduled
        .filter((s) => s.updatedAt >= from)
        .reduce((a, s) => a + net(s.estimatedPriceCdf, rideRule.platformPercent), 0);
    const sumAll = (from: Date) =>
      sumRides(from) +
      sumDeliveries(from) +
      sumMovings(from) +
      sumErrands(from) +
      sumRentals(from) +
      sumCarpools(from) +
      sumScheduled(from);

    return {
      totalCdf: sumAll(new Date(0)),
      todayCdf: sumAll(startOfDay),
      weekCdf: sumAll(startOfWeek),
      monthCdf: sumAll(startOfMonth),
      rideCount: rides.length,
      deliveryCount: deliveries.length,
      movingCount: movings.length,
      todayRideCount: rides.filter((r) => r.completedAt && r.completedAt >= startOfDay).length,
      todayDeliveryCount: deliveries.filter((d) => d.deliveredAt && d.deliveredAt >= startOfDay).length,
      todayMovingCount: movings.filter((m) => m.completedAt && m.completedAt >= startOfDay).length,
      rideEarningsCdf: sumRides(new Date(0)),
      deliveryEarningsCdf: sumDeliveries(new Date(0)),
      movingEarningsCdf: sumMovings(new Date(0)),
      commissionPercent: rideRule.platformPercent,
      deliveryCommissionPercent: deliveryRule.platformPercent,
      movingCommissionPercent: movingRule.platformPercent,
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

  /** Séries temporelles et KPIs pour rapports admin (7–90 jours). */
  async getReportAnalytics(days = 30) {
    const periodDays = Math.min(Math.max(Number(days) || 30, 7), 90);
    const since = new Date();
    since.setDate(since.getDate() - periodDays + 1);
    since.setHours(0, 0, 0, 0);

    const [rides, deliveries, errands, moving, scheduled, carpool] = await Promise.all([
      this.prisma.ride.findMany({
        where: { createdAt: { gte: since } },
        select: {
          createdAt: true,
          status: true,
          vehicleType: true,
          finalFareCdf: true,
          estimatedFareCdf: true,
        },
      }),
      this.prisma.delivery.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, type: true, finalPriceCdf: true, estimatedPriceCdf: true },
      }),
      this.prisma.errandOrder.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, status: true, finalPriceCdf: true },
      }),
      this.prisma.movingRequest.count({ where: { createdAt: { gte: since } } }),
      this.prisma.scheduledRide.count({ where: { createdAt: { gte: since } } }),
      this.prisma.carpoolTrip.count({ where: { createdAt: { gte: since } } }),
    ]);

    const dailyMap = new Map<string, { date: string; rides: number; completed: number; revenueCdf: number; cancelled: number; deliveries: number }>();
    for (let i = 0; i < periodDays; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, rides: 0, completed: 0, revenueCdf: 0, cancelled: 0, deliveries: 0 });
    }

    const vehicleBreakdown: Record<string, number> = {};
    let completedCount = 0;
    let cancelledCount = 0;
    let totalRevenue = 0;

    for (const ride of rides) {
      const key = ride.createdAt.toISOString().slice(0, 10);
      const bucket = dailyMap.get(key);
      if (bucket) {
        bucket.rides++;
        if (ride.status === RideStatus.COMPLETED) {
          bucket.completed++;
          const fare = ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
          bucket.revenueCdf += fare;
          totalRevenue += fare;
          completedCount++;
        }
        if (ride.status === RideStatus.CANCELLED) {
          bucket.cancelled++;
          cancelledCount++;
        }
      }
      vehicleBreakdown[ride.vehicleType] = (vehicleBreakdown[ride.vehicleType] ?? 0) + 1;
    }

    for (const delivery of deliveries) {
      const key = delivery.createdAt.toISOString().slice(0, 10);
      if (dailyMap.has(key)) dailyMap.get(key)!.deliveries += 1;
    }
    for (const errand of errands) {
      const key = errand.createdAt.toISOString().slice(0, 10);
      if (dailyMap.has(key)) dailyMap.get(key)!.deliveries += 1;
    }

    const deliveryRevenue = deliveries.reduce(
      (sum, d) => sum + (d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0),
      0,
    );
    const errandRevenue = errands.reduce((sum, e) => sum + (e.finalPriceCdf ?? 0), 0);

    return {
      periodDays,
      generatedAt: new Date().toISOString(),
      daily: Array.from(dailyMap.values()),
      vehicleBreakdown,
      serviceBreakdown: {
        rides: rides.length,
        deliveries: deliveries.length,
        errands: errands.length,
        food: deliveries.filter((d) => d.type === DeliveryType.FOOD).length,
        parcel: deliveries.filter((d) => d.type === DeliveryType.PARCEL).length,
        express: deliveries.filter((d) => d.type === DeliveryType.EXPRESS).length,
        moving,
        scheduled,
        carpool,
      },
      kpis: {
        totalRides: rides.length,
        completedRides: completedCount,
        cancelledRides: cancelledCount,
        completionRate: rides.length ? completedCount / rides.length : 0,
        cancelRate: rides.length ? cancelledCount / rides.length : 0,
        totalRevenueCdf: totalRevenue,
        deliveryRevenueCdf: deliveryRevenue + errandRevenue,
        avgTicketCdf: completedCount ? Math.round(totalRevenue / completedCount) : 0,
        totalDeliveries: deliveries.length + errands.length,
      },
    };
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
