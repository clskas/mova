import { Injectable } from '@nestjs/common';
import { CommissionServiceType, DeliveryType } from '@prisma/client';
import { MARKET_RDC } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionService } from '../rides/commission.service';
import { parseFoodItemShares, parseOrderPlacedMetadata } from '../deliveries/food-delivery-settlement.util';

export type DriverHistoryType = 'PARCEL' | 'FOOD' | 'EXPRESS' | 'ERRAND' | 'MOVING' | 'SCHEDULED' | 'RENTAL' | 'CARPOOL';

export type DriverHistoryItem = {
  type: DriverHistoryType;
  id: string;
  status: string;
  title: string;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  /** What the mission is worth before the SENGA commission. */
  driverGrossCdf: number;
  platformFeeCdf: number;
  driverNetCdf: number;
  commissionPercent: number;
  createdAt: string;
  completedAt?: string | null;
};

const COMMISSION_OF: Record<DriverHistoryType, CommissionServiceType> = {
  PARCEL: CommissionServiceType.DELIVERY,
  EXPRESS: CommissionServiceType.DELIVERY,
  FOOD: CommissionServiceType.DELIVERY,
  ERRAND: CommissionServiceType.ERRAND,
  MOVING: CommissionServiceType.MOVING,
  SCHEDULED: CommissionServiceType.RIDE,
  RENTAL: CommissionServiceType.RENTAL,
  CARPOOL: CommissionServiceType.CARPOOL,
};

/**
 * Every mission of a driver other than immediate taxi rides (those come from /rides/history,
 * which also handles cash confirmation). Amounts are the driver's view: gross, SENGA fee, net.
 */
@Injectable()
export class DriverHistoryService {
  constructor(
    private prisma: PrismaService,
    private commission: CommissionService,
  ) {}

  async list(driverId: string, limit = 50, before?: Date) {
    const take = Math.min(Math.max(limit, 1), 100);
    const createdAt = before && !Number.isNaN(before.getTime()) ? { lt: before } : undefined;
    const where = { driverId, ...(createdAt ? { createdAt } : {}) };
    const [deliveries, errands, movings, scheduled, rentals, carpools] = await Promise.all([
      this.prisma.delivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: { restaurant: { select: { name: true } }, events: { where: { event: 'ORDER_PLACED' }, take: 1 } },
      }),
      this.prisma.errandOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.movingRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.scheduledRide.findMany({ where: { ...where, rideId: null }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.rentalInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: { vehicle: { select: { name: true } } },
      }),
      this.prisma.carpoolTrip.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
    ]);

    const rules = new Map<CommissionServiceType, number>();
    const pct = async (t: DriverHistoryType) => {
      const key = COMMISSION_OF[t];
      if (!rules.has(key)) rules.set(key, (await this.commission.get(key)).platformPercent);
      return rules.get(key)!;
    };
    const items: DriverHistoryItem[] = [];
    const push = async (
      type: DriverHistoryType,
      row: { id: string; status: string; createdAt: Date },
      title: string,
      gross: number,
      extra: Partial<DriverHistoryItem> = {},
    ) => {
      const percent = await pct(type);
      const split = this.commission.splitGross(Math.max(0, Math.round(gross || 0)), percent);
      items.push({
        type,
        id: row.id,
        status: row.status,
        title,
        driverGrossCdf: split.grossCdf,
        platformFeeCdf: split.platformFeeCdf,
        driverNetCdf: split.driverNetCdf,
        commissionPercent: split.platformPercent,
        createdAt: row.createdAt.toISOString(),
        ...extra,
      });
    };

    for (const d of deliveries) {
      let gross = d.finalPriceCdf ?? d.estimatedPriceCdf;
      if (d.type === DeliveryType.FOOD) {
        // The courier earns the delivery fee, not the meal.
        const meta = parseOrderPlacedMetadata(d.events);
        gross =
          meta.deliveryFeeCdf ??
          Math.max(0, gross - parseFoodItemShares(d.items).reduce((sum, s) => sum + s.itemsGrossCdf, 0));
      }
      await push(
        d.type as DriverHistoryType,
        d,
        d.type === DeliveryType.FOOD ? (d.restaurant?.name ?? 'Repas') : (d.dropoffAddress ?? d.deliveryAddress ?? 'Livraison'),
        gross,
        { pickupAddress: d.pickupAddress, dropoffAddress: d.dropoffAddress ?? d.deliveryAddress, completedAt: d.deliveredAt?.toISOString() ?? null },
      );
    }
    for (const e of errands) {
      // Service fee only: purchases are reimbursed, not earnings.
      await push('ERRAND', e, e.description, e.finalPriceCdf ?? e.estimatedPriceCdf, {
        pickupAddress: e.pickupAddress,
        dropoffAddress: e.dropoffAddress,
        completedAt: e.completedAt?.toISOString() ?? null,
      });
    }
    for (const m of movings) {
      await push('MOVING', m, `${m.pickupAddress} → ${m.dropoffAddress}`, m.estimatedPriceCdf, {
        pickupAddress: m.pickupAddress,
        dropoffAddress: m.dropoffAddress,
        completedAt: m.completedAt?.toISOString() ?? null,
      });
    }
    for (const s of scheduled) {
      await push('SCHEDULED', s, `${s.pickupAddress ?? 'Départ'} → ${s.dropoffAddress ?? 'Arrivée'}`, s.estimatedPriceCdf, {
        pickupAddress: s.pickupAddress,
        dropoffAddress: s.dropoffAddress,
      });
    }
    for (const r of rentals) {
      // The logistics driver is paid a fixed delivery/collection fee, not the rental itself.
      await push('RENTAL', r, r.vehicle?.name ?? 'Location', MARKET_RDC.interCity.baseSurchargeCdf * 2);
    }
    for (const c of carpools) {
      await push('CARPOOL', c, `${c.pickupAddress ?? 'Départ'} → ${c.dropoffAddress ?? 'Arrivée'}`, c.pricePerSeatCdf * c.seatsTotal, {
        pickupAddress: c.pickupAddress,
        dropoffAddress: c.dropoffAddress,
      });
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const page = items.slice(0, take);
    return { data: page, hasMore: items.length > take, currency: 'CDF' };
  }
}
