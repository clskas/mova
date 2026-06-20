import { HttpStatus, Injectable } from '@nestjs/common';
import { CommissionServiceType, ErrandOrder, ErrandOrderStatus, TrackingReferenceType, VehicleType } from '@prisma/client';
import { MARKET_RDC, MovaErrorCode, MovaHttpException, MOVA_EVENTS } from '@mova/shared';
import { RedisService } from '@mova/shared';
import { addressToCoords, DEFAULT_PICKUP } from '../common/address.util';
import {
  assertDriverCanReceiveJobs,
  driverCanReceiveJobs,
  fetchDriverProfileSnapshot,
} from '../common/driver-eligibility.util';
import { tripDistanceKm } from '../common/geo.util';
import { fetchAuthUserBrief } from '../common/internal-lookup.util';
import { buildErrandTimeline } from '../deliveries/parcel.util';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../rides/pricing.service';
import { CommissionService } from '../rides/commission.service';
import { TrackingService } from '../tracking/tracking.service';
import { TripShareService } from '../share/trip-share.service';
import { CreateErrandOrderDto } from './errands.dto';

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

  async estimate(dto: CreateErrandOrderDto, itemCount = 0) {
    const { baseCdf } = await this.errandFees();
    const distanceKm = this.pricing.haversineKm(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
    const durationMin = (distanceKm / 18) * 60;
    const fare = await this.pricing.estimateFare(VehicleType.MOTO_TAXI, distanceKm, durationMin);
    const { itemCdf } = await this.errandFees();
    const itemsFee = itemCount * itemCdf;
    const estimatedPriceCdf = Math.ceil(fare.estimatedFareCdf + baseCdf + itemsFee);
    return {
      estimatedPriceCdf,
      formatted: `${estimatedPriceCdf.toLocaleString('fr-CD')} FC`,
      distanceKm,
      durationMin,
      errandFeeCdf: baseCdf,
      itemsFeeCdf: itemsFee,
      budgetCdf: dto.budgetCdf,
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

  /** Compatibilité mobile: { deliveryAddress, items[], pickupAddress?, budgetCdf? } */
  async estimateMobile(deliveryAddress: string, items: string[], pickupAddress?: string, budgetCdf?: number) {
    const parsed = this.parseMobileItems(items, budgetCdf);
    const pickup = this.resolvePickup(pickupAddress);
    const dropoff = addressToCoords(deliveryAddress);
    const dto: CreateErrandOrderDto = {
      description: parsed.description,
      pickupAddress: pickup.label,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropoffAddress: deliveryAddress,
      dropoffLat: dropoff.lat,
      dropoffLng: dropoff.lng,
      budgetCdf: parsed.budget ?? undefined,
    };
    const estimate = await this.estimate(dto, parsed.items.length);
    return { ...estimate, currency: 'CDF', items: parsed.items };
  }

  async create(userId: string, dto: CreateErrandOrderDto, structuredItems?: ErrandItemRow[]) {
    const itemCount = structuredItems?.length ?? 0;
    const estimate = await this.estimate(dto, itemCount);
    const order = await this.prisma.errandOrder.create({
      data: {
        userId,
        status: ErrandOrderStatus.PENDING,
        description: dto.description,
        items: structuredItems?.length ? structuredItems : undefined,
        budgetCdf: dto.budgetCdf,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffAddress: dto.dropoffAddress,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        estimatedPriceCdf: estimate.estimatedPriceCdf,
        distanceKm: estimate.distanceKm,
        durationMin: estimate.durationMin,
      },
    });
    return { order, estimate };
  }

  async createMobile(
    userId: string,
    deliveryAddress: string,
    items: string[],
    deliveryLat?: number,
    deliveryLng?: number,
    pickupAddress?: string,
    budgetCdf?: number,
  ) {
    const parsed = this.parseMobileItems(items, budgetCdf);
    const pickup = this.resolvePickup(pickupAddress);
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
    };
    const { order, estimate } = await this.create(userId, dto, parsed.items);
    return {
      errand: {
        id: order.id,
        status: order.status,
        type: 'ERRAND',
        deliveryAddress,
        items: parsed.items.map((i) => i.label),
        structuredItems: parsed.items,
        budgetCdf: order.budgetCdf,
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
      purchaseTotalCdf: order.purchaseTotalCdf,
      finalPriceCdf: order.finalPriceCdf ?? order.estimatedPriceCdf,
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
      priceCdf: order.estimatedPriceCdf,
      distanceKm: order.distanceKm,
      durationMin: order.durationMin,
      createdAt: order.createdAt.toISOString(),
      timeline,
      tracking: timeline,
      paymentReady: order.status === ErrandOrderStatus.COMPLETED,
      currency: 'CDF',
      city: 'Kinshasa',
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
      return {
        ...this.formatErrand(order),
        offerType: 'ERRAND',
        alreadyAssigned: true,
        tripDistanceKm: tripKm,
        distanceToPickupKm,
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
        return {
          ...this.formatErrand(order),
          offerType: 'ERRAND',
          tripDistanceKm: tripKm,
          distanceToPickupKm,
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

  async updateStatusByDriver(id: string, driverId: string, status: ErrandOrderStatus) {
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
    const updates: Record<string, unknown> = { status };
    if (status === ErrandOrderStatus.COMPLETED) {
      updates.completedAt = new Date();
      updates.finalPriceCdf = order.finalPriceCdf ?? order.estimatedPriceCdf;
    }
    const updated = await this.prisma.errandOrder.update({ where: { id }, data: updates });
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
    if (order.status === ErrandOrderStatus.COMPLETED || order.status === ErrandOrderStatus.CANCELLED) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    return this.prisma.errandOrder.update({
      where: { id },
      data: { status: ErrandOrderStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  async updateStatus(id: string, userId: string, status: ErrandOrderStatus) {
    const order = await this.get(id, userId);
    const allowed: Record<ErrandOrderStatus, ErrandOrderStatus[]> = {
      [ErrandOrderStatus.PENDING]: [ErrandOrderStatus.ASSIGNED, ErrandOrderStatus.CANCELLED],
      [ErrandOrderStatus.ASSIGNED]: [ErrandOrderStatus.IN_PROGRESS, ErrandOrderStatus.CANCELLED],
      [ErrandOrderStatus.IN_PROGRESS]: [ErrandOrderStatus.COMPLETED],
      [ErrandOrderStatus.COMPLETED]: [],
      [ErrandOrderStatus.CANCELLED]: [],
    };
    if (!allowed[order.status]?.includes(status)) {
      throw new MovaHttpException(MovaErrorCode.ERRAND_INVALID_STATUS);
    }
    const updates: Record<string, unknown> = { status };
    if (status === ErrandOrderStatus.COMPLETED) updates.completedAt = new Date();
    if (status === ErrandOrderStatus.CANCELLED) updates.cancelledAt = new Date();
    const updated = await this.prisma.errandOrder.update({ where: { id }, data: updates });
    const timeline = buildErrandTimeline(updated.status, updated.completedAt);
    return {
      order: updated,
      timeline,
      paymentReady: status === ErrandOrderStatus.COMPLETED,
    };
  }
}
