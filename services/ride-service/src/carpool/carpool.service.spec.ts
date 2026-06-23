import { CarpoolStatus } from '@prisma/client';
import { CarpoolService } from './carpool.service';
import { PricingService } from '../rides/pricing.service';

describe('CarpoolService', () => {
  const haversineKm = jest.fn().mockReturnValue(3);
  const pricing = {
    haversineKm,
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 12000 }),
  } as unknown as PricingService;

  const prisma = {
    carpoolTrip: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    carpoolPassenger: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    carpoolRating: { aggregate: jest.fn(), upsert: jest.fn() },
  };

  const service = new CarpoolService(prisma as never, pricing);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.carpoolRating.aggregate.mockResolvedValue({ _avg: { score: null } });
  });

  it('refuse la publication covoiturage aux passagers', async () => {
    await expect(service.assertCanPublishCarpool('user-1', 'PASSENGER')).rejects.toMatchObject({
      code: 'MOVA_CAR_004',
    });
  });

  it('filtre les trajets par proximité (matching stub)', async () => {
    prisma.carpoolTrip.findMany.mockResolvedValue([
      { id: 't1', pickupLat: -4.31, pickupLng: 15.3, dropoffLat: -4.34, dropoffLng: 15.32, status: CarpoolStatus.OPEN, seatsAvailable: 2, passengers: [], departureAt: new Date(Date.now() + 86400000), pricePerSeatCdf: 3000, seatsTotal: 3, driverId: 'd1' },
      { id: 't2', pickupLat: -4.5, pickupLng: 15.5, dropoffLat: -4.6, dropoffLng: 15.6, status: CarpoolStatus.OPEN, seatsAvailable: 1, passengers: [], departureAt: new Date(Date.now() + 86400000), pricePerSeatCdf: 5000, seatsTotal: 3, driverId: 'd2' },
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
      seatsTotal: 3,
      pricePerSeatCdf: 4000,
      pickupLat: -4.31,
      pickupLng: 15.3,
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      departureAt: new Date(Date.now() + 86400000),
      passengers: [],
    });
    prisma.carpoolPassenger.create.mockResolvedValue({ id: 'p1', tripId: 't1', userId: 'user-2', seats: 2 });
    prisma.carpoolTrip.update.mockResolvedValue({
      id: 't1',
      seatsAvailable: 1,
      status: CarpoolStatus.OPEN,
      seatsTotal: 3,
      pricePerSeatCdf: 4000,
      pickupLat: -4.31,
      pickupLng: 15.3,
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      departureAt: new Date(Date.now() + 86400000),
      driverId: 'driver-1',
      passengers: [{ id: 'p1', userId: 'user-2', seats: 2 }],
    });
    const result = await service.join('t1', 'user-2', 2);
    expect(result.trip.availableSeats).toBe(1);
    expect(result.confirmation.totalCdf).toBe(8000);
  });

  it('recherche et trie par prix', async () => {
    prisma.carpoolTrip.findMany.mockResolvedValue([
      {
        id: 'cheap',
        pickupAddress: 'Gombe, Kinshasa',
        dropoffAddress: 'Limete, Kinshasa',
        fromCity: 'Kinshasa',
        toCity: 'Kinshasa',
        pickupLat: -4.31,
        pickupLng: 15.3,
        dropoffLat: -4.34,
        dropoffLng: 15.32,
        seatsAvailable: 2,
        pricePerSeatCdf: 2000,
        seatsTotal: 3,
        driverId: 'd1',
        status: CarpoolStatus.OPEN,
        departureAt: new Date(Date.now() + 86400000),
        passengers: [],
      },
    ]);
    const result = await service.search({ from: 'Gombe', to: 'Limete', sort: 'price' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].pricePerSeatCdf).toBe(2000);
    expect(result.data[0].etaLabel).toContain('km');
  });

  it('annule la réservation passager via cancelTripOrBooking', async () => {
    prisma.carpoolTrip.findUnique
      .mockResolvedValueOnce({
        id: 't1',
        driverId: 'driver-1',
        status: CarpoolStatus.OPEN,
        seatsAvailable: 1,
        departureAt: new Date(Date.now() + 86400000),
        passengers: [{ id: 'p1', userId: 'user-2', seats: 2 }],
      })
      .mockResolvedValueOnce({
        id: 't1',
        driverId: 'driver-1',
        status: CarpoolStatus.OPEN,
        seatsAvailable: 1,
        seatsTotal: 3,
        pricePerSeatCdf: 3000,
        pickupLat: -4.31,
        pickupLng: 15.3,
        dropoffLat: -4.34,
        dropoffLng: 15.32,
        pickupAddress: 'Gombe',
        dropoffAddress: 'Limete',
        departureAt: new Date(Date.now() + 86400000),
        passengers: [{ id: 'p1', userId: 'user-2', seats: 2 }],
      });
    prisma.carpoolPassenger.findFirst.mockResolvedValue({ id: 'p1', tripId: 't1', userId: 'user-2', seats: 2 });
    prisma.carpoolPassenger.delete.mockResolvedValue({});
    prisma.carpoolTrip.update.mockResolvedValue({
      id: 't1',
      driverId: 'driver-1',
      status: CarpoolStatus.OPEN,
      seatsAvailable: 3,
      seatsTotal: 3,
      pricePerSeatCdf: 3000,
      pickupLat: -4.31,
      pickupLng: 15.3,
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      departureAt: new Date(Date.now() + 86400000),
      passengers: [],
    });
    const result = await service.cancelTripOrBooking('t1', 'user-2');
    expect('cancelled' in result && result.cancelled).toBe(true);
  });
});
