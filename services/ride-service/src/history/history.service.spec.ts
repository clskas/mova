import { HistoryService } from './history.service';

describe('HistoryService', () => {
  const prisma = {
    ride: { findMany: jest.fn().mockResolvedValue([]) },
    rideSharePassenger: { findMany: jest.fn().mockResolvedValue([]) },
    delivery: { findMany: jest.fn().mockResolvedValue([]) },
    errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
    scheduledRide: { findMany: jest.fn().mockResolvedValue([]) },
    carpoolPassenger: { findMany: jest.fn().mockResolvedValue([]) },
    carpoolTrip: { findMany: jest.fn().mockResolvedValue([]) },
    rentalInquiry: { findMany: jest.fn().mockResolvedValue([]) },
    movingRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = new HistoryService(prisma as never);

  it('retourne un historique unifié vide', async () => {
    const result = await service.getUnifiedHistory('user-1');
    expect(result.data).toEqual([]);
    expect(result.currency).toBe('CDF');
  });

  it('agrège les courses passager', async () => {
    prisma.ride.findMany.mockResolvedValue([
      {
        id: 'r1',
        status: 'COMPLETED',
        pickupAddress: 'Gombe',
        dropoffAddress: 'Limete',
        finalFareCdf: 5000,
        estimatedFareCdf: 5000,
        vehicleType: 'STANDARD',
        distanceKm: 3,
        isShared: false,
        createdAt: new Date('2025-06-01'),
      },
    ]);
    prisma.rideSharePassenger.findMany.mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        r1: { rideId: 'r1', isPaid: true, paymentStatus: 'COMPLETED' },
      }),
    });
    const result = await service.getUnifiedHistory('user-1', 'RIDE');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('RIDE');
    expect(result.data[0].priceCdf).toBe(5000);
    expect(result.data[0].isPaid).toBe(true);
    expect(result.data[0].paymentReady).toBe(false);
  });

  it('Pool: isPaid lit ServicePayment du booking, pas Payment parent', async () => {
    prisma.ride.findMany.mockResolvedValue([
      {
        id: 'pool-1',
        status: 'COMPLETED',
        pickupAddress: 'Gombe',
        dropoffAddress: 'Limete',
        finalFareCdf: 3000,
        estimatedFareCdf: 3000,
        vehicleType: 'STANDARD',
        distanceKm: 2,
        isShared: true,
        createdAt: new Date('2025-06-02'),
      },
    ]);
    prisma.rideSharePassenger.findMany.mockResolvedValue([{ id: 'bk-1', rideId: 'pool-1' }]);
    global.fetch = jest.fn().mockImplementation((url: string, init?: { body?: string }) => {
      if (String(url).includes('/internal/services/payment-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            'bk-1': {
              referenceType: 'RIDE_SHARE',
              referenceId: 'bk-1',
              isPaid: true,
              paymentStatus: 'COMPLETED',
            },
          }),
        });
      }
      // solo payment batch should not be needed for shared-only
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const result = await service.getUnifiedHistory('user-1', 'RIDE');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].isPaid).toBe(true);
    expect(result.data[0].paymentReady).toBe(false);
    expect(result.data[0].meta?.paymentReferenceId).toBe('bk-1');
  });
});
