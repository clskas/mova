import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionServiceType, ErrandCategory, ErrandOrder, ErrandOrderStatus, TrackingReferenceType, VehicleType } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException, MOVA_EVENTS, canCancelErrand, estimateTripDurationMin } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import {
  assertDriverCanReceiveJobs,
  driverCanReceiveJobs,
  fetchDriverProfileSnapshot,
} from '../common/driver-eligibility.util';
import { tripDistanceKm } from '../common/geo.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { notifyNearbyDrivers } from '../common/driver-job-alert.util';
import { captureWalletHold, holdWalletFunds, releaseWalletHold } from '../common/wallet-hold.util';
import { buildErrandTimeline } from '../deliveries/parcel.util';
import { MatchingService } from '../matching/matching.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CommissionService } from '../rides/commission.service';
import { TrackingService } from '../tracking/tracking.service';
import { TripShareService } from '../share/trip-share.service';
import { CreateErrandOrderDto } from './errands.dto';
import { estimatePurchaseByCategory, inferErrandCategory } from './errand-category.util';
import { applyPromoCode } from '../common/promo-apply.util';
import { PromoService } from '../rides/surcharge.service';
import { RoutingService } from '../geo/routing.service';

export type ErrandItemRow = { label: string; qty?: number; estimatedCdf?: number };

@Injectable()
export class ErrandsService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private commission: CommissionService,
    private redis: RedisService,
    private trackingService: TrackingService,
    private tripShare: TripShareService,
    private matching: MatchingService,
    private promo: PromoService,
    private routing: RoutingService,
  ) {}

  private async errandFees() {
    const rule = await this.commission.get(CommissionServiceType.ERRAND);
    return {
      baseCdf: rule.fixedFeeCdf ?? 2500,
      itemCdf: rule.perItemFeeCdf ?? 1500,
    };
  }

  private parseMobileItems(rawItems: string[], budgetCdf?: number): { items: ErrandItemRow[]; description: string; budget: number | null } {
    const items = rawItems
      .filter((line) => !/^Budget max:/i.test(line.trim()))
      .map((label) => ({ label: label.trim(), qty: 1 }));
    const description = items.map((i) => i.label).join(', ') || 'Course';
    const budget = budgetCdf && budgetCdf > 0 ? budgetCdf : null;
    return { items, description, budget };
  }

  private itemsFromOrder(order: ErrandOrder): ErrandItemRow[] {
    if (order.items && Array.isArray(order.items)) {
      return order.items as ErrandItemRow[];
    }
    return order.description.split(', ').filter(Boolean).map((label) => ({ label, qty: 1 }));
  }

  async estimate(dto: CreateErrandOrderDto, itemCount = 0, category?: ErrandCategory, redeemPromo = false) {
    const { baseCdf } = await this.errandFees();
    const route = await this.routing.resolveRoadDistance(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const distanceKm = route.distanceKm;
    const durationMin = route.durationMin ?? estimateTripDurationMin(distanceKm, MARKET_RDC.trip.averageSpeedKmh.errand);
    const fare = await this.pricing.estimateFare(VehicleType.STANDARD, distanceKm, durationMin);
    const { itemCdf } = await this.errandFees();
    const itemsFee = itemCount * itemCdf;
    const resolvedCategory = category ?? inferErrandCategory(dto.pickupAddress, dto.description.split(', '));
    const estimatedPurchaseCdf = estimatePurchaseByCategory(resolvedCategory, itemCount);
    const serviceFeeCdf = Math.ceil(fare.estimatedFareCdf + baseCdf + itemsFee);
    const promoApplied = await applyPromoCode(this.promo, serviceFeeCdf, dto.promoCode, redeemPromo, {
      context: { serviceType: 'ERRAND' },
    });
    return {
      estimatedPriceCdf: promoApplied.estimatedPriceCdf,
      formatted: `${promoApplied.estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
      errandFeeCdf: baseCdf,
      itemsFeeCdf: itemsFee,
      budgetCdf: dto.budgetCdf,
      category: resolvedCategory,
      estimatedPurchaseCdf,
      categoryLabel: MARKET_RDC.errand.categoryEstimates[resolvedCategory]?.label ?? 'Autre',
      discountCdf: promoApplied.discountCdf,
      promoCode: promoApplied.promoCode,
    };
  }

  private resolvePickup(pickupAddress?: string) {
    const label = pickupAddress?.trim();
    if (label) {
      const coords = addressToCoords(label);
      return { label, lat: coords.lat, lng: coords.lng };
    }
    return { label: DEFAULT_PICKUP.label, lat: DEFAULT_PICKUP.lat, lng: DEFAULT_PICKUP.lng };
  }

  /** Compatibilité mobile: { deliveryAddress, items[], pickupAddress?, pickupLat?, pickupLng?, budgetCdf? } */
  async estimateMobile(
    deliveryAddress: string,
    items: string[],
    pickupAddress?: string,
    budgetCdf?: number,
    pickupLat?: number,
    pickupLng?: number,
    promoCode?: string,
  ) {
    const parsed = this.parseMobileItems(items, budgetCdf);
    const pickup = pickupLat != null && pickupLng != null
      ? { label: pickupAddress?.trim() || 'Point de retrait', lat: pickupLat, lng: pickupLng }
      : this.resolvePickup(pickupAddress);
    const dropoff = addressToCoords(deliveryAddress);
    const category = inferErrandCategory(pickup.label, parsed.items.map((i) => i.label));
    const dto: CreateErrandOrderDto = {
      description: parsed.description,
      pickupAddress: pickup.label,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: deliveryAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      budgetCdf: parsed.budget ?? undefined,
      promoCode,
    };
    const estimate = await this.estimate(dto, parsed.items.length, category);
    return { ...estimate, currency: 'CDF', items: parsed.items };
  }

  private async alertErrandOffer(order: ErrandOrder) {
    await notifyNearbyDrivers(this.redis, this.matching, {
      jobKind: 'DELIVERY_OFFER',
      referenceId: order.id,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      pickupAddress: order.pickupAddress,
      title: 'Nouvelle course & commissions',
      body: `Retrait · ${order.pickupAddress}`,
      data: { deliveryType: 'ERRAND', category: order.category },
    }).catch(() => undefined);
  }

  private async maybeHoldBudget(userId: string, orderId: string, budgetCdf?: number | null) {
    if (!budgetCdf || budgetCdf <= 0) return null;
    await holdWalletFunds(userId, budgetCdf, 'ERRAND', orderId, `Séquestre budget course ${orderId}`);
    return budgetCdf;
  }

  async create(userId: string, dto: CreateErrandOrderDto, structuredItems?: ErrandItemRow[]) {
    const itemCount = structuredItems?.length ?? 0;
    const category = inferErrandCategory(dto.pickupAddress, dto.description.split(', '));
    const estimate = await this.estimate(dto, itemCount, category, true);
    const order = await this.prisma.errandOrder.create({
      data: {
        userId,
        status: ErrandOrderStatus.PENDING,
        category,
        description: dto.description,
        items: structuredItems?.length ? structuredItems : undefined,
        budgetCdf: dto.budgetCdf,
        estimatedPurchaseCdf: estimate.estimatedPurchaseCdf,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        promoCode: estimate.promoCode,
        discountCdf: estimate.discountCdf || undefined,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
    });
    const walletHoldCdf = await this.maybeHoldBudget(userId, order.id, dto.budgetCdf).catch((err) => {
      void this.prisma.errandOrder.delete({ where: { id: order.id } }).catch(() => undefined);
      throw err;
    });
    if (walletHoldCdf) {
      await this.prisma.errandOrder.update({ where: { id: order.id }, data: { walletHoldCdf } });
    }
    const finalOrder = await this.prisma.errandOrder.findUniqueOrThrow({ where: { id: order.id } });
    await this.alertErrandOffer(finalOrder);
    await this.redis.publish(MOVA_EVENTS.ERRAND_CREATED, {
      errandId: finalOrder.id,
      userId,
      pickupAddress: finalOrder.pickupAddress,
      pickupLat: finalOrder.pickupLat,
      pickupLng: finalOrder.pickupLng,
      estimatedPriceCdf: finalOrder.estimatedPriceCdf,
    });
    return { order: finalOrder, estimate };
  }

  async createMobile(
    userId: string,
    deliveryAddress: string,
    items: string[],
    deliveryLat?: number,
    deliveryLng?: number,
    pickupAddress?: string,
    budgetCdf?: number,
    pickupLat?: number,
    pickupLng?: number,
    promoCode?: string,
  ) {
    const parsed = this.parseMobileItems(items, budgetCdf);
    const pickup = pickupLat != null && pickupLng != null
      ? { label: pickupAddress?.trim() || 'Point de retrait', lat: pickupLat, lng: pickupLng }
      : this.resolvePickup(pickupAddress);
    const dropoff = deliveryLat != null && deliveryLng != null ? { lat: deliveryLat, lng: deliveryLng } : addressToCoords(deliveryAddress);
    const dto: CreateErrandOrderDto = {
      description: parsed.description,
      pickupAddress: pickup.label,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: deliveryAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      budgetCdf: parsed.budget ?? undefined,
      promoCode,
    };
    const { order, estimate } = await this.create(userId, dto, parsed.items);
    return {
      errand: {
        id: order.id,
        status: order.status,
        type: 'ERRAND',
        category: order.category,
        deliveryAddress,
        items: parsed.items.map((i) => i.label),
        structuredItems: parsed.items,
        budgetCdf: order.budgetCdf,
        walletHoldCdf: order.walletHoldCdf,
        estimatedPurchaseCdf: order.estimatedPurchaseCdf,
        priceCdf: estimate.estimatedPriceCdf,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        createdAt: order.createdAt.toISOString(),
      },
    };
  }

  async list(userId: string) {
    return this.prisma.errandOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listMobile(userId: string) {
    const rows = await this.list(userId);
    return rows.map((o) => ({
      id: o.id,
      type: 'ERRAND',
      deliveryAddress: o.dropoffAddress,
      items: o.description.split(', ').filter(Boolean),
      status: o.status,
      priceCdf: o.estimatedPriceCdf,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  private formatErrand(order: ErrandOrder, extra?: Record<string, unknown>) {
    const structuredItems = this.itemsFromOrder(order);
    const timeline = buildErrandTimeline(order.status, order.completedAt);
    const serviceFeeCdf = order.finalPriceCdf ?? order.estimatedPriceCdf;
    const purchaseCdf = order.purchaseTotalCdf ?? 0;
    const totalPriceCdf = serviceFeeCdf + purchaseCdf;
    return {
      id: order.id,
      type: 'ERRAND',
      status: order.status,
      userId: order.userId,
      driverId: order.driverId,
      description: order.description,
      items: structuredItems.map((i) => i.label),
      structuredItems,
      budgetCdf: order.budgetCdf,
      walletHoldCdf: order.walletHoldCdf,
      estimatedPurchaseCdf: order.estimatedPurchaseCdf,
      category: order.category,
      purchaseTotalCdf: order.purchaseTotalCdf,
      finalPriceCdf: serviceFeeCdf,
      serviceFeeCdf,
      totalPriceCdf,
      completionPin: order.completionPin,
      proofPhotoUrl: order.proofPhotoUrl,
      pickupAddress: order.pickupAddress,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      dropoffAddress: order.dropoffAddress,
      deliveryAddress: order.dropoffAddress,
      dropoffLat: order.dropoffLat,
      dropoffLng: order.dropoffLng,
      estimatedPriceCdf: order.estimatedPriceCdf,
      priceCdf: totalPriceCdf,
      distanceKm: order.distanceKm,
      durationMin: order.durationMin,
      createdAt: order.createdAt.toISOString(),
      timeline,
      tracking: timeline,
      paymentReady: order.status === ErrandOrderStatus.COMPLETED,
      currency: 'CDF',
      city: 'Kinshasa',
      ...canCancelErrand({ status: order.status }),
      ...extra,
    };
  }

  async get(id: string, userId: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.userId !== userId && order.driverId !== userId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    return {
      ...this.formatErrand(order),
      errand: this.formatErrand(order),
      order,
      gpsTrace: await this.trackingService.getTrace(TrackingReferenceType.ERRAND, id),
    };
  }

  async getDriverOffers(driverUserId: string) {
    const profile = await fetchDriverProfileSnapshot(driverUserId);
    if (!profile?.isAvailable || !driverCanReceiveJobs(profile)) {
      return { offers: [] as Record<string, unknown>[] };
    }
    const hasGps = profile.currentLat != null && profile.currentLng != null;

    const [pendingErrands, assignedErrands] = await Promise.all([
      this.prisma.errandOrder.findMany({
        where: { status: ErrandOrderStatus.PENDING, driverId: null },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.errandOrder.findMany({
        where: {
          driverId: driverUserId,
          status: { in: [ErrandOrderStatus.ASSIGNED, ErrandOrderStatus.IN_PROGRESS] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const radiusKm = MARKET_RDC.matching.maxRadiusKm;
    const errandRule = await this.commission.get(CommissionServiceType.ERRAND);
    const assignedOffers = assignedErrands.map((order) => {
      const tripKm = tripDistanceKm(
        order.pickupLat,
        order.pickupLng,
        order.dropoffLat,
        order.dropoffLng,
        order.distanceKm,
      );
      const distanceToPickupKm = hasGps
        ? tripDistanceKm(profile.currentLat!, profile.currentLng!, order.pickupLat, order.pickupLng)
        : 0;
      const gross = (order.finalPriceCdf ?? order.estimatedPriceCdf) + (order.purchaseTotalCdf ?? 0);
      const driverNetCdf = Math.round(this.commission.splitGross(gross, errandRule.platformPercent).driverNetCdf);
      return {
        ...this.formatErrand(order),
        offerType: 'ERRAND',
        alreadyAssigned: true,
        tripDistanceKm: tripKm,
        distanceToPickupKm,
        driverNetCdf,
      };
    });

    if (!hasGps) {
      return { offers: assignedOffers };
    }

    const openOffers = pendingErrands
      .map((order) => {
        const tripKm = tripDistanceKm(
          order.pickupLat,
          order.pickupLng,
          order.dropoffLat,
          order.dropoffLng,
          order.distanceKm,
        );
        const distanceToPickupKm = tripDistanceKm(
          profile.currentLat!,
          profile.currentLng!,
          order.pickupLat,
          order.pickupLng,
        );
        const gross = (order.finalPriceCdf ?? order.estimatedPriceCdf) + (order.purchaseTotalCdf ?? 0);
        const driverNetCdf = Math.round(this.commission.splitGross(gross, errandRule.platformPercent).driverNetCdf);
        return {
          ...this.formatErrand(order),
          offerType: 'ERRAND',
          tripDistanceKm: tripKm,
          distanceToPickupKm,
          driverNetCdf,
          _withinRadius: distanceToPickupKm <= radiusKm,
        };
      })
      .filter((o) => o._withinRadius)
      .map(({ _withinRadius: _, ...offer }) => offer)
      .sort((a, b) => (a.distanceToPickupKm as number) - (b.distanceToPickupKm as number));

    return { offers: [...assignedOffers, ...openOffers] };
  }

  async listForDriver(driverUserId: string) {
    const rows = await this.prisma.errandOrder.findMany({
      where: {
        driverId: driverUserId,
        status: { notIn: [ErrandOrderStatus.COMPLETED, ErrandOrderStatus.CANCELLED] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      data: rows.map((order) => ({
        ...this.formatErrand(order),
        type: 'ERRAND',
        label: 'Courses & commissions',
      })),
    };
  }

  async acceptErrand(errandId: string, driverUserId: string) {
    await assertDriverCanReceiveJobs(driverUserId);
    const order = await this.prisma.errandOrder.findUnique({ where: { id: errandId } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.status !== ErrandOrderStatus.PENDING || order.driverId) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    const updated = await this.prisma.errandOrder.update({
      where: { id: errandId },
      data: { driverId: driverUserId, status: ErrandOrderStatus.ASSIGNED, completionPin: this.tripShare.generateCompletionPin() },
    });
    const formatted = this.formatErrand(updated);
    await this.redis.publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
      serviceType: 'ERRAND',
      referenceId: updated.id,
      driverId: driverUserId,
      passengerId: updated.userId,
      summary: `Courses ${updated.pickupAddress} → ${updated.dropoffAddress}`,
      pickupAddress: updated.pickupAddress,
      dropoffAddress: updated.dropoffAddress,
    });
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'ERRAND',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return { errand: formatted, delivery: formatted, success: true };
  }

  async listDriverHistory(driverUserId: string) {
    const rows = await this.prisma.errandOrder.findMany({
      where: { driverId: driverUserId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((o) => this.formatErrand(o));
  }

  async updateStatusByDriver(
    id: string,
    driverId: string,
    status: ErrandOrderStatus,
    purchaseTotalCdf?: number,
    proofPhotoUrl?: string,
  ) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.driverId !== driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const allowed: Record<ErrandOrderStatus, ErrandOrderStatus[]> = {
      [ErrandOrderStatus.PENDING]: [ErrandOrderStatus.IN_PROGRESS],
      [ErrandOrderStatus.ASSIGNED]: [ErrandOrderStatus.IN_PROGRESS],
      [ErrandOrderStatus.IN_PROGRESS]: [ErrandOrderStatus.COMPLETED],
      [ErrandOrderStatus.COMPLETED]: [],
      [ErrandOrderStatus.CANCELLED]: [],
    };
    if (!allowed[order.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    if (status === ErrandOrderStatus.IN_PROGRESS) {
      await assertDriverCanReceiveJobs(driverId);
    }
    if (status === ErrandOrderStatus.COMPLETED) {
      const proof = proofPhotoUrl?.trim() || order.proofPhotoUrl;
      if (!proof) {
        throw new MovaHttpException(
          MovaErrorCode.ERRAND_INVALID_STATUS,
          HttpStatus.BAD_REQUEST,
          'Photo preuve d\'achat obligatoire avant complétion.',
        );
      }
    }
    const updates: Record<string, unknown> = { status };
    if (status === ErrandOrderStatus.COMPLETED) {
      updates.completedAt = new Date();
      updates.finalPriceCdf = order.finalPriceCdf ?? order.estimatedPriceCdf;
      if (purchaseTotalCdf != null && purchaseTotalCdf >= 0) {
        updates.purchaseTotalCdf = Math.round(purchaseTotalCdf);
      }
      if (proofPhotoUrl?.trim()) updates.proofPhotoUrl = proofPhotoUrl.trim();
    }
    const updated = await this.prisma.errandOrder.update({ where: { id }, data: updates });
    if (status === ErrandOrderStatus.COMPLETED && updated.walletHoldCdf) {
      const captureAmount = (updated.purchaseTotalCdf ?? 0) + (updated.finalPriceCdf ?? updated.estimatedPriceCdf);
      await captureWalletHold('ERRAND', updated.id, Math.min(captureAmount, updated.walletHoldCdf)).catch(() => undefined);
    }
    const formatted = this.formatErrand(updated);
    await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
      serviceType: 'ERRAND',
      referenceId: updated.id,
      userId: updated.userId,
      status: updated.status,
    });
    return {
      errand: formatted,
      delivery: formatted,
      timeline: formatted.timeline,
      paymentReady: status === ErrandOrderStatus.COMPLETED,
    };
  }

  async uploadProofPhoto(id: string, driverId: string, proofPhotoUrl: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.driverId !== driverId) {
      throw new MovaHttpException(MovaErrorCode.AUTH_UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }
    const updated = await this.prisma.errandOrder.update({
      where: { id },
      data: { proofPhotoUrl: proofPhotoUrl.trim() },
    });
    return this.formatErrand(updated);
  }

  async listForAdmin(take = 50) {
    const rows = await this.prisma.errandOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return Promise.all(
      rows.map(async (o) => {
        const passenger = await fetchAuthUserBrief(o.userId);
        const driver = o.driverId ? await fetchAuthUserBrief(o.driverId) : null;
        return {
          id: o.id,
          type: 'ERRAND',
          status: o.status,
          pickupAddress: o.pickupAddress,
          dropoffAddress: o.dropoffAddress,
          description: o.description,
          restaurantName: o.description,
          priceCdf: o.estimatedPriceCdf,
          userId: o.userId,
          driverId: o.driverId,
          passengerName: passenger?.name,
          passengerPhone: passenger?.phone,
          driverName: driver?.name,
          driverPhone: driver?.phone,
          createdAt: o.createdAt.toISOString(),
        };
      }),
    );
  }

  async getAdmin(id: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    const passenger = await fetchAuthUserBrief(order.userId);
    const driver = order.driverId ? await fetchAuthUserBrief(order.driverId) : null;
    return {
      ...this.formatErrand(order),
      userId: order.userId,
      driverId: order.driverId,
      passengerName: passenger?.name,
      passengerPhone: passenger?.phone,
      driverName: driver?.name,
      driverPhone: driver?.phone,
      pickupLat: order.pickupLat,
      pickupLng: order.pickupLng,
      dropoffLat: order.dropoffLat,
      dropoffLng: order.dropoffLng,
      gpsTrace: await this.trackingService.getTrace(TrackingReferenceType.ERRAND, id),
    };
  }

  async adminUpdateStatus(id: string, status: ErrandOrderStatus) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    const updates: Record<string, unknown> = { status };
    if (status === ErrandOrderStatus.COMPLETED) updates.completedAt = new Date();
    if (status === ErrandOrderStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.errandOrder.update({ where: { id }, data: updates });
    return this.formatErrand(updated);
  }

  async adminCancel(id: string, reason?: string) {
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.status === ErrandOrderStatus.COMPLETED || order.status === ErrandOrderStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    const updated = await this.prisma.errandOrder.update({
      where: { id },
      data: { status: ErrandOrderStatus.CANCELLED, cancelledAt: new Date() },
    });
    return { ...this.formatErrand(updated), cancelReason: reason };
  }

  async adminAssignDriver(id: string, driverId: string) {
    if (!driverId?.trim()) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, undefined, 'Chauffeur requis.');
    }
    await assertDriverCanReceiveJobs(driverId.trim());
    const order = await this.prisma.errandOrder.findUnique({ where: { id } });
    if (!order) throw new MovaHttpException(MovaErrorCode.ERRAND_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (order.status === ErrandOrderStatus.COMPLETED || order.status === ErrandOrderStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    const updated = await this.prisma.errandOrder.update({
      where: { id },
      data: {
        driverId: driverId.trim(),
        status: order.status === ErrandOrderStatus.PENDING ? ErrandOrderStatus.ASSIGNED : order.status,
        completionPin: order.completionPin ?? this.tripShare.generateCompletionPin(),
      },
    });
    const driver = await fetchAuthUserBrief(updated.driverId!);
    await this.redis.publish(MOVA_EVENTS.SERVICE_ASSIGNED, {
      serviceType: 'ERRAND',
      referenceId: updated.id,
      driverId: updated.driverId!,
      passengerId: updated.userId,
      summary: `Courses & commissions ${updated.pickupAddress ?? ''} → ${updated.dropoffAddress}`,
      pickupAddress: updated.pickupAddress ?? undefined,
      dropoffAddress: updated.dropoffAddress,
    });
    if (updated.status !== order.status) {
      await this.redis.publish(MOVA_EVENTS.SERVICE_STATUS_UPDATED, {
        serviceType: 'ERRAND',
        referenceId: updated.id,
        userId: updated.userId,
        status: updated.status,
      });
    }
    return { ...this.formatErrand(updated), driverName: driver?.name, driverPhone: driver?.phone };
  }

  async cancel(id: string, userId: string) {
    const order = await this.get(id, userId);
    const cancelEligibility = canCancelErrand({ status: order.status });
    if (!cancelEligibility.canCancel) {
      throw new MovaHttpException(
        MovaErrorCode.ERRAND_INVALID_STATUS,
        undefined,
        cancelEligibility.cancelBlockReason,
      );
    }
    return this.prisma.errandOrder.update({
      where: { id },
      data: { status: ErrandOrderStatus.CANCELLED, cancelledAt: new Date() },
    }).then(async (updated) => {
      if (updated.walletHoldCdf) {
        await releaseWalletHold('ERRAND', updated.id).catch(() => undefined);
      }
      return updated;
    });
  }

  async updateStatus(id: string, userId: string, status: ErrandOrderStatus) {
    await this.get(id, userId);
    if (status !== ErrandOrderStatus.CANCELLED) {
      throw new MovaHttpException(
        MovaErrorCode.ERRAND_INVALID_STATUS,
        HttpStatus.FORBIDDEN,
        'Seul l\'annulation est autorisée depuis l\'application passager.',
      );
    }
    return this.cancel(id, userId);
  }
}
