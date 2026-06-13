import { HistoryService } from './history.service';

describe('HistoryService', () => {
  const prisma = {
    ride: { findMany: jest.fn().mockResolvedValue([]) },
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
        createdAt: new Date('2025-06-01'),
      },
    ]);
    const result = await service.getUnifiedHistory('user-1', 'RIDE');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].type).toBe('RIDE');
    expect(result.data[0].priceCdf).toBe(5000);
  });
});
