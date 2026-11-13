import { HttpStatus, Injectable } from '@nestjs/common';
import { INTERNAL_API_KEY, MovaErrorCode, MovaHttpException, parseDayBoundary, serviceUrl } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';

export type TestCleanupFilter = {
  /** Only items created up to this day (YYYY-MM-DD, Kinshasa) — e.g. the day before launch. */
  before?: string;
  /** Only items where one of these users is the customer, the driver or the partner. */
  userIds?: string[];
  /** Real duration below this many minutes (default 5). */
  maxMinutes?: number;
};

export type TestCleanupItem = {
  key: string;
  type: 'RIDE' | 'DELIVERY' | 'ERRAND' | 'MOVING' | 'RENTAL' | 'CARPOOL' | 'SCHEDULED';
  id: string;
  createdAt: string;
  durationMin: number;
  priceCdf: number;
  customerId: string | null;
  driverId: string | null;
  label: string;
  extraIds: string[];
};

const minutes = (from?: Date | null, to?: Date | null) =>
  from && to ? (new Date(to).getTime() - new Date(from).getTime()) / 60000 : Number.POSITIVE_INFINITY;

/**
 * Test rides / services that never really happened (finished in under N minutes), voided in
 * accounting: the payment service reverses every wallet entry, then the item is marked
 * cancelled (testVoidedAt) so it leaves revenue, earnings and stats. Nothing is deleted.
 */
@Injectable()
export class TestCleanupService {
  constructor(private prisma: PrismaService) {}

  private parseFilter(f: TestCleanupFilter) {
    const before = f.before ? parseDayBoundary(f.before, 'end') : null;
    const userIds = [...new Set((f.userIds ?? []).map((u) => String(u).trim()).filter(Boolean))];
    if (!before && userIds.length === 0) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'Indiquez une date limite ou des comptes de test : sans filtre, de vraies courses courtes seraient touchées.',
      );
    }
    const maxMinutes = Math.min(30, Math.max(1, Number(f.maxMinutes) || 5));
    return { before, userIds, maxMinutes };
  }

  async select(filter: TestCleanupFilter): Promise<TestCleanupItem[]> {
    const { before, userIds, maxMinutes } = this.parseFilter(filter);
    const created = before ? { createdAt: { lte: before } } : {};
    const who = (fields: string[]) =>
      userIds.length ? { OR: fields.map((f) => ({ [f]: { in: userIds } })) } : {};
    const notVoided = { testVoidedAt: null };
    const take = 2000;
    const items: TestCleanupItem[] = [];

    const rides = await this.prisma.ride.findMany({
      where: { status: 'COMPLETED', ...created, ...notVoided, ...who(['passengerId', 'driverId']) },
      select: {
        id: true, createdAt: true, acceptedAt: true, startedAt: true, completedAt: true, passengerId: true,
        driverId: true, finalFareCdf: true, estimatedFareCdf: true, pickupAddress: true, dropoffAddress: true,
        sharePassengers: { select: { id: true } },
      },
      take,
    });
    for (const r of rides) {
      const d = minutes(r.startedAt ?? r.acceptedAt, r.completedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `RIDE:${r.id}`, type: 'RIDE', id: r.id, createdAt: r.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: r.finalFareCdf ?? r.estimatedFareCdf ?? 0, customerId: r.passengerId, driverId: r.driverId,
        label: `${r.pickupAddress ?? 'Départ'} → ${r.dropoffAddress ?? 'Arrivée'}`, extraIds: r.sharePassengers.map((p) => p.id),
      });
    }

    const deliveries = await this.prisma.delivery.findMany({
      where: { status: 'DELIVERED', ...created, ...notVoided, ...who(['userId', 'driverId']) },
      select: {
        id: true, type: true, createdAt: true, pickedUpAt: true, deliveredAt: true, userId: true, driverId: true,
        finalPriceCdf: true, estimatedPriceCdf: true, dropoffAddress: true, deliveryAddress: true,
      },
      take,
    });
    for (const x of deliveries) {
      const d = minutes(x.pickedUpAt ?? x.createdAt, x.deliveredAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `DELIVERY:${x.id}`, type: 'DELIVERY', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: x.finalPriceCdf ?? x.estimatedPriceCdf ?? 0, customerId: x.userId, driverId: x.driverId,
        label: `${x.type} · ${x.dropoffAddress ?? x.deliveryAddress ?? ''}`, extraIds: [],
      });
    }

    const errands = await this.prisma.errandOrder.findMany({
      where: { status: 'COMPLETED', ...created, ...notVoided, ...who(['userId', 'driverId']) },
      select: { id: true, createdAt: true, completedAt: true, userId: true, driverId: true, finalPriceCdf: true, estimatedPriceCdf: true, purchaseTotalCdf: true, description: true },
      take,
    });
    for (const x of errands) {
      const d = minutes(x.createdAt, x.completedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `ERRAND:${x.id}`, type: 'ERRAND', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: (x.finalPriceCdf ?? x.estimatedPriceCdf ?? 0) + (x.purchaseTotalCdf ?? 0), customerId: x.userId, driverId: x.driverId,
        label: (x.description ?? 'Courses & commissions').slice(0, 80), extraIds: [],
      });
    }

    const moves = await this.prisma.movingRequest.findMany({
      where: { status: 'COMPLETED', ...created, ...notVoided, ...who(['userId', 'driverId']) },
      select: { id: true, createdAt: true, completedAt: true, userId: true, driverId: true, estimatedPriceCdf: true, pickupAddress: true, dropoffAddress: true },
      take,
    });
    for (const x of moves) {
      const d = minutes(x.createdAt, x.completedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `MOVING:${x.id}`, type: 'MOVING', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: x.estimatedPriceCdf, customerId: x.userId, driverId: x.driverId,
        label: `${x.pickupAddress} → ${x.dropoffAddress}`, extraIds: [],
      });
    }

    const rentals = await this.prisma.rentalInquiry.findMany({
      where: {
        status: { in: ['RETURNED', 'PAID'] }, ...created, ...notVoided,
        ...(userIds.length ? { OR: [{ userId: { in: userIds } }, { driverId: { in: userIds } }, { vehicle: { ownerUserId: { in: userIds } } }] } : {}),
      },
      select: { id: true, createdAt: true, checkOutAt: true, updatedAt: true, userId: true, driverId: true, totalCdf: true, estimatedPriceCdf: true, vehicle: { select: { ownerUserId: true, make: true, model: true } } },
      take,
    });
    for (const x of rentals) {
      const d = minutes(x.createdAt, x.checkOutAt ?? x.updatedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `RENTAL:${x.id}`, type: 'RENTAL', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: x.totalCdf ?? x.estimatedPriceCdf ?? 0, customerId: x.userId, driverId: x.vehicle?.ownerUserId ?? x.driverId,
        label: `Location ${[x.vehicle?.make, x.vehicle?.model].filter(Boolean).join(' ')}`.trim(), extraIds: [],
      });
    }

    const trips = await this.prisma.carpoolTrip.findMany({
      where: {
        status: 'COMPLETED', ...created, ...notVoided,
        ...(userIds.length ? { OR: [{ driverId: { in: userIds } }, { passengers: { some: { userId: { in: userIds } } } }] } : {}),
      },
      select: { id: true, createdAt: true, updatedAt: true, driverId: true, pricePerSeatCdf: true, pickupAddress: true, dropoffAddress: true, passengers: { select: { id: true, userId: true, seats: true } } },
      take,
    });
    for (const x of trips) {
      const d = minutes(x.createdAt, x.updatedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `CARPOOL:${x.id}`, type: 'CARPOOL', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: x.passengers.reduce((s, p) => s + p.seats * x.pricePerSeatCdf, 0), customerId: x.passengers[0]?.userId ?? null,
        driverId: x.driverId, label: `Covoiturage ${x.pickupAddress ?? ''} → ${x.dropoffAddress ?? ''}`, extraIds: x.passengers.map((p) => p.id),
      });
    }

    // Scheduled rides: the real trip is the linked ride (started → completed), the booking itself
    // is made days before. Without a linked ride the real duration is unknown: left out.
    const scheduled = await this.prisma.scheduledRide.findMany({
      where: {
        status: 'COMPLETED', rideId: { not: null }, ...created, ...notVoided, ...who(['passengerId', 'driverId']),
      },
      select: {
        id: true, createdAt: true, rideId: true, passengerId: true, driverId: true, estimatedPriceCdf: true,
        pickupAddress: true, dropoffAddress: true,
      },
      take,
    });
    const linked = scheduled.length
      ? await this.prisma.ride.findMany({
          where: { id: { in: scheduled.map((s) => s.rideId!) } },
          select: { id: true, startedAt: true, completedAt: true, updatedAt: true, finalFareCdf: true },
        })
      : [];
    const linkedById = new Map(linked.map((r) => [r.id, r]));
    for (const x of scheduled) {
      const r = linkedById.get(x.rideId!);
      if (!r) continue;
      const d = minutes(r.startedAt, r.completedAt ?? r.updatedAt);
      if (d >= maxMinutes) continue;
      items.push({
        key: `SCHEDULED:${x.id}`, type: 'SCHEDULED', id: x.id, createdAt: x.createdAt.toISOString(), durationMin: Math.round(d * 10) / 10,
        priceCdf: r.finalFareCdf ?? x.estimatedPriceCdf, customerId: x.passengerId, driverId: x.driverId,
        label: `Planifiée ${x.pickupAddress ?? ''} → ${x.dropoffAddress ?? ''}`, extraIds: [x.rideId!],
      });
    }

    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async paymentVoid(items: TestCleanupItem[], apply: boolean) {
    const res = await fetch(serviceUrl('payment', '/internal/test-void'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify({
        apply,
        items: items.map((i) => ({ referenceType: i.type, referenceId: i.id, extraIds: i.extraIds })),
      }),
    });
    if (!res.ok) {
      throw new MovaHttpException(MovaErrorCode.PAYMENT_FAILED, HttpStatus.BAD_GATEWAY, 'Service paiement indisponible — rien n’a été modifié.');
    }
    return (await res.json()) as Record<string, unknown>;
  }

  /** Changes nothing: the list and the money that would be reversed. */
  async preview(filter: TestCleanupFilter) {
    const items = await this.select(filter);
    const money = items.length ? await this.paymentVoid(items, false) : { items: [], platformCommissionCdf: 0 };
    return { count: items.length, items, money };
  }

  /** Voids exactly the items the admin reviewed (keys), if they still match the filter. */
  async apply(filter: TestCleanupFilter, confirmKeys: string[]) {
    const wanted = new Set((confirmKeys ?? []).map(String));
    const items = (await this.select(filter)).filter((i) => wanted.has(i.key));
    if (items.length === 0) return { count: 0, money: { items: [] } };
    const money = await this.paymentVoid(items, true);
    const now = new Date();
    const reason = 'Test annulé en comptabilité (durée < seuil)';
    for (const i of items) {
      const ids = { where: { id: i.id } };
      if (i.type === 'RIDE') await this.prisma.ride.update({ ...ids, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason, testVoidedAt: now } });
      else if (i.type === 'DELIVERY') await this.prisma.delivery.update({ ...ids, data: { status: 'CANCELLED', cancelledAt: now, testVoidedAt: now } });
      else if (i.type === 'ERRAND') await this.prisma.errandOrder.update({ ...ids, data: { status: 'CANCELLED', cancelledAt: now, testVoidedAt: now } });
      else if (i.type === 'MOVING') await this.prisma.movingRequest.update({ ...ids, data: { status: 'CANCELLED', cancelledAt: now, testVoidedAt: now } });
      else if (i.type === 'RENTAL') await this.prisma.rentalInquiry.update({ ...ids, data: { status: 'CLOSED', testVoidedAt: now } });
      else if (i.type === 'CARPOOL') await this.prisma.carpoolTrip.update({ ...ids, data: { status: 'CANCELLED', testVoidedAt: now } });
      else if (i.type === 'SCHEDULED') {
        await this.prisma.scheduledRide.update({ ...ids, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason, testVoidedAt: now } });
        // The linked ride carried the trip: out of revenue and stats too.
        await this.prisma.ride.updateMany({
          where: { id: { in: i.extraIds }, testVoidedAt: null },
          data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason, testVoidedAt: now },
        });
      }
    }
    return { count: items.length, money };
  }
}
