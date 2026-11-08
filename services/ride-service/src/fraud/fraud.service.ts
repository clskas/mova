import { Injectable } from '@nestjs/common';
import { DeliveryStatus, DeliveryType, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRidePaymentStatuses, fetchServicePaymentStatuses } from '../common/payment-status.util';

export type FraudCancellation = {
  rideId: string;
  passengerId: string;
  driverId: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
  vehicleType: string;
  amountCdf: number;
  /** RIDE (default) or DELIVERY (colis / express). `rideId` then holds the delivery id. */
  serviceType?: 'RIDE' | 'DELIVERY';
};

export type FraudPair = {
  passengerId: string;
  driverId: string;
  totalRides: number;
  cancelledAfterAccept: number;
  completed: number;
};

export type FraudUnpaid = {
  rideId: string;
  passengerId: string;
  driverId: string | null;
  completedAt: string | null;
  amountCdf: number;
  paymentStatus: string | null;
  serviceType?: 'RIDE' | 'DELIVERY';
};

export type FraudSignalsReport = {
  periodDays: number;
  generatedAt: string;
  cancellations: FraudCancellation[];
  pairs: FraudPair[];
  unpaidCompleted: FraudUnpaid[];
};

/**
 * A cancellation this long after the driver accepted is suspicious (they met and finished
 * the trip outside the app). A quick cancel is usually a simple change of mind.
 */
export const FRAUD_CANCEL_MIN_MS = 3 * 60_000;
/**
 * Cash is confirmed up to 24 h after the trip: before that, « not paid yet » is normal.
 */
export const FRAUD_UNPAID_GRACE_MS = 24 * 60 * 60_000;

/**
 * Détection anti-contournement (désintermédiation) côté ride-service.
 * Signaux bruts sur les courses et les livraisons colis / express :
 *  - Annulation par le client ou le chauffeur au moins 3 min après l'acceptation.
 *  - Paires passager/chauffeur qui se retrouvent souvent sans aboutir dans le système.
 *  - Course / livraison terminée depuis plus de 24 h dont le paiement n'est pas validé
 *    (hors espèces déjà en litige : elles sont traitées dans Litiges).
 * Le scoring est fait par l'admin-service.
 */
@Injectable()
export class FraudService {
  constructor(private prisma: PrismaService) {}

  private rideAmount(ride: { finalFareCdf?: number | null; estimatedFareCdf?: number | null }): number {
    return ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
  }

  async getSignals(days = 30, minPairOccurrences = 2, now = Date.now()): Promise<FraudSignalsReport> {
    const periodDays = Math.min(Math.max(Number(days) || 30, 1), 180);
    const since = new Date(now);
    since.setDate(since.getDate() - periodDays + 1);
    since.setHours(0, 0, 0, 0);
    const graceCutoff = now - FRAUD_UNPAID_GRACE_MS;

    const rides = await this.prisma.ride.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        passengerId: true,
        driverId: true,
        status: true,
        vehicleType: true,
        acceptedAt: true,
        completedAt: true,
        cancelledAt: true,
        cancelledBy: true,
        cancelReason: true,
        finalFareCdf: true,
        estimatedFareCdf: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const cancellations: FraudCancellation[] = [];
    const completedRides: { id: string; passengerId: string; driverId: string | null; completedAt: Date | null; amountCdf: number }[] = [];
    const pairAcc = new Map<string, FraudPair>();

    for (const ride of rides) {
      const amountCdf = this.rideAmount(ride);
      const hadDriver = Boolean(ride.driverId);
      const wasAssigned = hadDriver && ride.acceptedAt != null;
      // Only a cancel by one of the two people, a while after acceptance (not admin / system).
      const byParty = ride.cancelledBy != null && (ride.cancelledBy === ride.passengerId || ride.cancelledBy === ride.driverId);
      const lateCancel =
        ride.acceptedAt != null &&
        ride.cancelledAt != null &&
        ride.cancelledAt.getTime() - ride.acceptedAt.getTime() >= FRAUD_CANCEL_MIN_MS;
      const suspiciousCancel = ride.status === RideStatus.CANCELLED && wasAssigned && byParty && lateCancel;

      if (suspiciousCancel) {
        cancellations.push({
          rideId: ride.id,
          passengerId: ride.passengerId,
          driverId: ride.driverId,
          cancelledBy: ride.cancelledBy,
          cancelReason: ride.cancelReason,
          acceptedAt: ride.acceptedAt ? ride.acceptedAt.toISOString() : null,
          cancelledAt: ride.cancelledAt ? ride.cancelledAt.toISOString() : null,
          vehicleType: ride.vehicleType,
          amountCdf,
          serviceType: 'RIDE',
        });
      }

      if (ride.status === RideStatus.COMPLETED && ride.completedAt && ride.completedAt.getTime() <= graceCutoff) {
        completedRides.push({
          id: ride.id,
          passengerId: ride.passengerId,
          driverId: ride.driverId,
          completedAt: ride.completedAt,
          amountCdf,
        });
      }

      if (hadDriver && ride.driverId) {
        const key = `${ride.passengerId}|${ride.driverId}`;
        const entry =
          pairAcc.get(key) ??
          { passengerId: ride.passengerId, driverId: ride.driverId, totalRides: 0, cancelledAfterAccept: 0, completed: 0 };
        entry.totalRides += 1;
        if (suspiciousCancel) entry.cancelledAfterAccept += 1;
        if (ride.status === RideStatus.COMPLETED) entry.completed += 1;
        pairAcc.set(key, entry);
      }
    }

    const pairs = [...pairAcc.values()]
      .filter((p) => p.cancelledAfterAccept >= minPairOccurrences)
      .sort((a, b) => b.cancelledAfterAccept - a.cancelledAfterAccept);

    const paymentStatuses = await fetchRidePaymentStatuses(completedRides.map((r) => r.id));
    // Payment service unreachable: no answer at all is « unknown », not « unpaid ».
    const ridePaymentsKnown = Object.keys(paymentStatuses).length > 0;
    const unpaidCompleted: FraudUnpaid[] = (ridePaymentsKnown ? completedRides : [])
      .map((r) => ({ ride: r, status: paymentStatuses[r.id] }))
      .filter(({ status }) => !status || (!status.isPaid && !status.cashDisputed))
      .map(({ ride, status }) => ({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        completedAt: ride.completedAt ? ride.completedAt.toISOString() : null,
        amountCdf: ride.amountCdf,
        paymentStatus: status?.paymentStatus ?? null,
        serviceType: 'RIDE' as const,
      }));

    const deliverySignals = await this.deliverySignals(since, graceCutoff);

    return {
      periodDays,
      generatedAt: new Date(now).toISOString(),
      cancellations: [...cancellations, ...deliverySignals.cancellations],
      pairs,
      unpaidCompleted: [...unpaidCompleted, ...deliverySignals.unpaid],
    };
  }

  /** Parcel / express deliveries: cancelled after a courier took it, or delivered but unpaid. */
  private async deliverySignals(since: Date, graceCutoff: number) {
    const rows = await this.prisma.delivery.findMany({
      where: {
        createdAt: { gte: since },
        type: { in: [DeliveryType.PARCEL, DeliveryType.EXPRESS] },
        driverId: { not: null },
        status: { in: [DeliveryStatus.CANCELLED, DeliveryStatus.DELIVERED] },
      },
      select: {
        id: true,
        userId: true,
        driverId: true,
        status: true,
        vehicleType: true,
        createdAt: true,
        deliveredAt: true,
        cancelledAt: true,
        finalPriceCdf: true,
        estimatedPriceCdf: true,
      },
      take: 5000,
    });
    const cancellations: FraudCancellation[] = [];
    const delivered: typeof rows = [];
    for (const d of rows) {
      const amountCdf = d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0;
      if (
        d.status === DeliveryStatus.CANCELLED &&
        d.cancelledAt &&
        d.cancelledAt.getTime() - d.createdAt.getTime() >= FRAUD_CANCEL_MIN_MS
      ) {
        cancellations.push({
          rideId: d.id,
          passengerId: d.userId,
          driverId: d.driverId,
          cancelledBy: null,
          cancelReason: null,
          acceptedAt: null,
          cancelledAt: d.cancelledAt.toISOString(),
          vehicleType: String(d.vehicleType ?? 'COLIS'),
          amountCdf,
          serviceType: 'DELIVERY',
        });
      }
      if (d.status === DeliveryStatus.DELIVERED && d.deliveredAt && d.deliveredAt.getTime() <= graceCutoff) {
        delivered.push(d);
      }
    }
    const statuses = await fetchServicePaymentStatuses('DELIVERY', delivered.map((d) => d.id));
    const known = Object.keys(statuses).length > 0;
    const unpaid: FraudUnpaid[] = (known ? delivered : [])
      .filter((d) => {
        const s = statuses[d.id];
        return !s || (!s.isPaid && !s.cashDisputed);
      })
      .map((d) => ({
        rideId: d.id,
        passengerId: d.userId,
        driverId: d.driverId,
        completedAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
        amountCdf: d.finalPriceCdf ?? d.estimatedPriceCdf ?? 0,
        paymentStatus: statuses[d.id]?.paymentStatus ?? null,
        serviceType: 'DELIVERY' as const,
      }));
    return { cancellations, unpaid };
  }
}
