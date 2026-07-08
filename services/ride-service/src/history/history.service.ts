import { Injectable } from '@nestjs/common';
import { RentalInquiryStatus, ScheduledRideStatus } from '@prisma/client';
import { toRideSummary } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { formatParcelDelivery } from '../deliveries/parcel.util';
import { fetchRidePaymentStatuses, fetchServicePaymentStatus } from '../common/payment-status.util';

export type HistoryType = 'RIDE' | 'PARCEL' | 'FOOD' | 'EXPRESS' | 'ERRAND' | 'SCHEDULED' | 'CARPOOL' | 'RENTAL' | 'MOVING';

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  async getUnifiedHistory(userId: string, type?: HistoryType, limit = 30) {
    const take = Math.min(Math.max(limit, 1), 100);
    const fetchPerType = type ? take : Math.min(take * 3, 100);
    const items: {
      type: HistoryType;
      id: string;
      status: string;
      title: string;
      priceCdf: number;
      createdAt: string;
      paymentReady?: boolean;
      isPaid?: boolean;
      meta?: Record<string, unknown>;
    }[] = [];

    const includeType = (t: HistoryType) => !type || type === t;

    if (includeType('RIDE')) {
      const rides = await this.prisma.ride.findMany({
        where: { passengerId: userId },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
      });
      const paymentMap = await fetchRidePaymentStatuses(rides.map((r) => r.id));
      for (const r of rides) {
        const summary = toRideSummary(r);
        const payment = paymentMap[r.id];
        const isPaid = payment?.isPaid ?? false;
        items.push({
          type: 'RIDE',
          id: r.id,
          status: r.status,
          title: `${r.pickupAddress ?? 'Départ'} → ${r.dropoffAddress ?? 'Arrivée'}`,
          priceCdf: r.finalFareCdf ?? r.estimatedFareCdf ?? summary.priceCdf ?? 0,
          createdAt: r.createdAt.toISOString(),
          paymentReady: r.status === 'COMPLETED' && !isPaid,
          isPaid: r.status === 'COMPLETED' ? isPaid : undefined,
          meta: {
            vehicleType: r.vehicleType,
            distanceKm: r.distanceKm,
            pickupAddress: r.pickupAddress,
            dropoffAddress: r.dropoffAddress,
            durationMin: r.durationMin,
          },
        });
      }
    }

    if (includeType('PARCEL') || includeType('FOOD') || includeType('EXPRESS')) {
      const deliveryTypes = [
        ...(includeType('PARCEL') ? (['PARCEL'] as const) : []),
        ...(includeType('FOOD') ? (['FOOD'] as const) : []),
        ...(includeType('EXPRESS') ? (['EXPRESS'] as const) : []),
      ];
      if (deliveryTypes.length) {
        const deliveries = await this.prisma.delivery.findMany({
          where: { userId, type: { in: [...deliveryTypes] } },
          orderBy: { createdAt: 'desc' },
          take: fetchPerType,
          include: { restaurant: { select: { id: true, name: true } }, events: { orderBy: { createdAt: 'asc' } } },
        });
        for (const d of deliveries) {
          const formatted = formatParcelDelivery(d);
          items.push({
            type: d.type as HistoryType,
            id: d.id,
            status: d.status,
            title: d.type === 'FOOD' ? (d.restaurant?.name ?? 'Repas') : (d.dropoffAddress ?? d.deliveryAddress ?? 'Livraison'),
            priceCdf: d.finalPriceCdf ?? d.estimatedPriceCdf,
            createdAt: d.createdAt.toISOString(),
            paymentReady: d.status === 'DELIVERED',
            meta: {
              pickupAddress: d.pickupAddress,
              dropoffAddress: d.dropoffAddress ?? d.deliveryAddress,
              deliveryAddress: d.deliveryAddress,
              photoUrl: d.photoUrl,
              restaurantName: d.restaurant?.name,
              restaurantId: d.restaurantId,
              items: d.items,
              weightCategory: d.weightCategory,
              deliveryLat: d.deliveryLat,
              deliveryLng: d.deliveryLng,
              timeline: formatted.timeline,
            },
          });
        }
      }
    }

    if (includeType('ERRAND')) {
      const errands = await this.prisma.errandOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
      });
      for (const e of errands) {
        items.push({
          type: 'ERRAND',
          id: e.id,
          status: e.status,
          title: e.description,
          priceCdf: e.estimatedPriceCdf,
          createdAt: e.createdAt.toISOString(),
          paymentReady: e.status === 'COMPLETED',
          meta: {
            dropoffAddress: e.dropoffAddress,
            pickupAddress: e.pickupAddress,
            distanceKm: e.distanceKm,
          },
        });
      }
    }

    if (includeType('SCHEDULED')) {
      const scheduled = await this.prisma.scheduledRide.findMany({
        where: { passengerId: userId, status: { not: ScheduledRideStatus.CANCELLED } },
        orderBy: { scheduledAt: 'desc' },
        take: fetchPerType,
      });
      for (const s of scheduled) {
        items.push({
          type: 'SCHEDULED',
          id: s.id,
          status: s.status,
          title: `${s.pickupAddress ?? 'Départ'} → ${s.dropoffAddress ?? 'Arrivée'}`,
          priceCdf: s.estimatedPriceCdf,
          createdAt: s.createdAt.toISOString(),
          meta: { scheduledAt: s.scheduledAt.toISOString(), vehicleType: s.vehicleType },
        });
      }
    }

    if (includeType('CARPOOL')) {
      const asPassenger = await this.prisma.carpoolPassenger.findMany({
        where: { userId },
        include: { trip: true },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
      });
      for (const p of asPassenger) {
        const payment =
          p.trip.status === 'COMPLETED'
            ? await fetchServicePaymentStatus('CARPOOL', p.id)
            : { isPaid: false };
        const isPaid = payment.isPaid;
        items.push({
          type: 'CARPOOL',
          id: p.trip.id,
          status: p.trip.status,
          title: `${p.trip.pickupAddress ?? 'Départ'} → ${p.trip.dropoffAddress ?? 'Arrivée'}`,
          priceCdf: p.trip.pricePerSeatCdf * p.seats,
          createdAt: p.createdAt.toISOString(),
          paymentReady: p.trip.status === 'COMPLETED' && !isPaid,
          isPaid,
          meta: { role: 'passenger', seats: p.seats, paymentReferenceId: p.id },
        });
      }
      const asDriver = await this.prisma.carpoolTrip.findMany({
        where: { driverId: userId },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
      });
      for (const t of asDriver) {
        items.push({
          type: 'CARPOOL',
          id: t.id,
          status: t.status,
          title: `${t.pickupAddress ?? 'Départ'} → ${t.dropoffAddress ?? 'Arrivée'}`,
          priceCdf: t.pricePerSeatCdf * t.seatsTotal,
          createdAt: t.createdAt.toISOString(),
          meta: { role: 'driver', seatsTotal: t.seatsTotal },
        });
      }
    }

    if (includeType('RENTAL')) {
      const rentals = await this.prisma.rentalInquiry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
        include: { vehicle: { select: { name: true, category: true } } },
      });
      for (const r of rentals) {
        const payment =
          r.status === RentalInquiryStatus.RETURNED || r.status === RentalInquiryStatus.PAID
            ? await fetchServicePaymentStatus('RENTAL', r.id)
            : { isPaid: false };
        const isPaid = payment.isPaid || r.status === RentalInquiryStatus.PAID;
        items.push({
          type: 'RENTAL',
          id: r.id,
          status: r.status,
          title: r.vehicle?.name ?? r.vehicleType,
          priceCdf: r.totalCdf ?? r.estimatedPriceCdf ?? 0,
          createdAt: r.createdAt.toISOString(),
          paymentReady: r.status === RentalInquiryStatus.RETURNED && !isPaid,
          isPaid,
          meta: {
            startDate: r.startDate.toISOString(),
            endDate: r.endDate.toISOString(),
            paymentReferenceId: r.id,
          },
        });
      }
    }

    if (includeType('MOVING')) {
      const movings = await this.prisma.movingRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: fetchPerType,
      });
      for (const m of movings) {
        const payment =
          m.status === 'COMPLETED' ? await fetchServicePaymentStatus('MOVING', m.id) : { isPaid: false };
        const isPaid = payment.isPaid;
        items.push({
          type: 'MOVING',
          id: m.id,
          status: m.status,
          title: `${m.pickupAddress} → ${m.dropoffAddress}`,
          priceCdf: m.estimatedPriceCdf,
          createdAt: m.createdAt.toISOString(),
          paymentReady: m.status === 'COMPLETED' && !isPaid,
          isPaid: m.status === 'COMPLETED' ? isPaid : undefined,
          meta: {
            volumeM3: m.volumeM3,
            distanceKm: m.distanceKm,
            pickupAddress: m.pickupAddress,
            dropoffAddress: m.dropoffAddress,
            photoUrls: Array.isArray(m.photoUrls) ? m.photoUrls : [],
            paymentReferenceId: m.id,
          },
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { data: items.slice(0, take), currency: 'CDF', city: 'Kinshasa' };
  }
}
