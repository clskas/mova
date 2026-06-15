import { CarpoolStatus } from '@prisma/client';
import { CarpoolService } from './carpool.service';
import { PricingService } from '../rides/pricing.service';

describe('CarpoolService', () => {
  const haversineKm = jest.fn().mockReturnValue(3);
  const pricing = {
    haversineKm,
    estimateFare: jest.fn(),
  } as unknown as PricingService;

  const prisma = {
    carpoolTrip: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    carpoolPassenger: { create: jest.fn(), findMany: jest.fn() },
  };

  const service = new CarpoolService(prisma as never, pricing);

  beforeEach(() => jest.clearAllMocks());

  it('filtre les trajets par proximité (matching stub)', async () => {
    prisma.carpoolTrip.findMany.mockResolvedValue([
      { id: 't1', pickupLat: -4.31, pickupLng: 15.3, dropoffLat: -4.34, dropoffLng: 15.32, status: CarpoolStatus.OPEN, seatsAvailable: 2, passengers: [] },
      { id: 't2', pickupLat: -4.5, pickupLng: 15.5, dropoffLat: -4.6, dropoffLng: 15.6, status: CarpoolStatus.OPEN, seatsAvailable: 1, passengers: [] },
    ]);
    haversineKm.mockImplementation((_a: number, _b: number, c: number) => (c === -4.5 ? 20 : 2));
    const result = await service.list({ pickupLat: -4.31, pickupLng: 15.3, dropoffLat: -4.34, dropoffLng: 15.32 });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].id).toBe('t1');
  });

  it('réduit les places disponibles au join', async () => {
    prisma.carpoolTrip.findUnique.mockResolvedValue({
      id: 't1',
      driverId: 'driver-1',
      status: CarpoolStatus.OPEN,
      seatsAvailable: 3,
      passengers: [],
    });
    prisma.carpoolPassenger.create.mockResolvedValue({ id: 'p1', tripId: 't1', userId: 'user-2', seats: 2 });
    prisma.carpoolTrip.update.mockResolvedValue({ id: 't1', seatsAvailable: 1, status: CarpoolStatus.OPEN, passengers: [] });
    const result = await service.join('t1', 'user-2', 2);
    expect(result.trip.availableSeats).toBe(1);
  });
});
