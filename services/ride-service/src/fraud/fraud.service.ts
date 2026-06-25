import { Injectable } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fetchRidePaymentStatuses } from '../common/payment-status.util';

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
};

export type FraudSignalsReport = {
  periodDays: number;
  generatedAt: string;
  cancellations: FraudCancellation[];
  pairs: FraudPair[];
  unpaidCompleted: FraudUnpaid[];
};

/**
 * Détection anti-contournement (désintermédiation) côté ride-service.
 * Calcule des signaux bruts à partir de l'historique des courses :
 *  - Annulations après assignation d'un chauffeur (course probablement réalisée hors app).
 *  - Paires passager/chauffeur qui se retrouvent souvent sans aboutir dans le système.
 *  - Courses terminées dont le paiement n'a jamais été validé.
 * Le scoring et la création d'incidents sont effectués par l'admin-service.
 */
@Injectable()
export class FraudService {
  constructor(private prisma: PrismaService) {}

  private rideAmount(ride: { finalFareCdf?: number | null; estimatedFareCdf?: number | null }): number {
    return ride.finalFareCdf ?? ride.estimatedFareCdf ?? 0;
  }

  async getSignals(days = 30, minPairOccurrences = 2): Promise<FraudSignalsReport> {
    const periodDays = Math.min(Math.max(Number(days) || 30, 1), 180);
    const since = new Date();
    since.setDate(since.getDate() - periodDays + 1);
    since.setHours(0, 0, 0, 0);

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

      if (ride.status === RideStatus.CANCELLED && wasAssigned) {
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
        });
      }

      if (ride.status === RideStatus.COMPLETED) {
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
        if (ride.status === RideStatus.CANCELLED && wasAssigned) entry.cancelledAfterAccept += 1;
        if (ride.status === RideStatus.COMPLETED) entry.completed += 1;
        pairAcc.set(key, entry);
      }
    }

    const pairs = [...pairAcc.values()]
      .filter((p) => p.cancelledAfterAccept >= minPairOccurrences)
      .sort((a, b) => b.cancelledAfterAccept - a.cancelledAfterAccept);

    const paymentStatuses = await fetchRidePaymentStatuses(completedRides.map((r) => r.id));
    const unpaidCompleted: FraudUnpaid[] = completedRides
      .map((r) => ({ ride: r, status: paymentStatuses[r.id] }))
      .filter(({ status }) => !status || !status.isPaid)
      .map(({ ride, status }) => ({
        rideId: ride.id,
        passengerId: ride.passengerId,
        driverId: ride.driverId,
        completedAt: ride.completedAt ? ride.completedAt.toISOString() : null,
        amountCdf: ride.amountCdf,
        paymentStatus: status?.paymentStatus ?? null,
      }));

    return {
      periodDays,
      generatedAt: new Date().toISOString(),
      cancellations,
      pairs,
      unpaidCompleted,
    };
  }
}
