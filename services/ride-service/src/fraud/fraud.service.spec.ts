jest.mock('../common/payment-status.util', () => ({
  fetchRidePaymentStatuses: jest.fn(),
  fetchServicePaymentStatuses: jest.fn().mockResolvedValue({}),
}));

import { RideStatus } from '@prisma/client';
import { FraudService } from './fraud.service';
import { fetchRidePaymentStatuses } from '../common/payment-status.util';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const min = (n: number) => n * 60_000;

function ride(over: Record<string, unknown>) {
  return {
    id: 'r',
    passengerId: 'p1',
    driverId: 'd1',
    status: RideStatus.CANCELLED,
    vehicleType: 'STANDARD',
    acceptedAt: new Date(NOW - min(60)),
    completedAt: null,
    cancelledAt: new Date(NOW - min(50)),
    cancelledBy: 'p1',
    cancelReason: null,
    finalFareCdf: 10000,
    estimatedFareCdf: 10000,
    ...over,
  };
}

function setup(rides: unknown[]) {
  const prisma = {
    ride: { findMany: jest.fn().mockResolvedValue(rides) },
    delivery: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new FraudService(prisma as never);
}

describe('FraudService.getSignals — fewer false alarms', () => {
  beforeEach(() => (fetchRidePaymentStatuses as jest.Mock).mockResolvedValue({}));

  it('counts a cancel by the passenger or driver at least 3 min after acceptance', async () => {
    const svc = setup([ride({ id: 'late' })]);
    const res = await svc.getSignals(30, 2, NOW);
    expect(res.cancellations.map((c) => c.rideId)).toEqual(['late']);
  });

  it('ignores a quick change of mind and an admin / system cancel', async () => {
    const svc = setup([
      ride({ id: 'quick', cancelledAt: new Date(NOW - min(59)) }),
      ride({ id: 'admin', cancelledBy: 'admin-42' }),
      ride({ id: 'system', cancelledBy: null }),
    ]);
    const res = await svc.getSignals(30, 2, NOW);
    expect(res.cancellations).toEqual([]);
  });

  it('a cash trip finished less than 24 h ago is not « unpaid » yet', async () => {
    (fetchRidePaymentStatuses as jest.Mock).mockResolvedValue({ old: { isPaid: false, paymentStatus: 'PENDING' }, x: { isPaid: true } });
    const svc = setup([
      ride({ id: 'recent', status: RideStatus.COMPLETED, completedAt: new Date(NOW - min(60)) }),
      ride({ id: 'old', status: RideStatus.COMPLETED, completedAt: new Date(NOW - min(60 * 30)) }),
    ]);
    const res = await svc.getSignals(30, 2, NOW);
    expect(res.unpaidCompleted.map((u) => u.rideId)).toEqual(['old']);
  });

  it('a cash dispute already in Litiges is not counted again', async () => {
    (fetchRidePaymentStatuses as jest.Mock).mockResolvedValue({ old: { isPaid: false, paymentStatus: 'PENDING', cashDisputed: true } });
    const svc = setup([ride({ id: 'old', status: RideStatus.COMPLETED, completedAt: new Date(NOW - min(60 * 30)) })]);
    const res = await svc.getSignals(30, 2, NOW);
    expect(res.unpaidCompleted).toEqual([]);
  });

  it('payment service unreachable: nothing is reported as unpaid', async () => {
    (fetchRidePaymentStatuses as jest.Mock).mockResolvedValue({});
    const svc = setup([ride({ id: 'old', status: RideStatus.COMPLETED, completedAt: new Date(NOW - min(60 * 30)) })]);
    const res = await svc.getSignals(30, 2, NOW);
    expect(res.unpaidCompleted).toEqual([]);
  });
});
