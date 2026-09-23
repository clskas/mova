import { RideSharePassengerStatus, RideStatus, VehicleType } from '@prisma/client';
import { RidePoolService } from './ride-pool.service';
import { mockPlatformConfig } from '../platform/platform-config.mock';

describe('RidePoolService', () => {
  const prisma = {
    rideSharePassenger: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    ride: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    rideEvent: { create: jest.fn() },
  };

  const pricing = {
    estimateFare: jest.fn().mockResolvedValue({
      totalCdf: 10000,
      baseFareCdf: 2000,
      distanceFareCdf: 6000,
      durationFareCdf: 2000,
      surchargeCdf: 0,
      estimatedFareCdf: 10000,
      estimatedPriceCdf: 10000,
      totalFormatted: '10 000 FC',
      distanceKm: 5,
      etaMinutes: 15,
    }),
    withInterCitySurcharge: jest.fn((f: { totalCdf: number }) => f),
    haversineKm: jest.fn((a: number, b: number, c: number, d: number) => {
      const dx = a - c;
      const dy = b - d;
      return Math.sqrt(dx * dx + dy * dy) * 111;
    }),
  };

  const routing = {
    resolveRoadDistance: jest.fn().mockResolvedValue({ distanceKm: 5, durationMin: 15, source: 'estimated' }),
  };

  const promo = { validateAndApply: jest.fn() };
  const redis = { publish: jest.fn() };
  const tripShare = { generateCompletionPin: jest.fn().mockReturnValue('1234') };

  const service = new RidePoolService(
    prisma as never,
    pricing as never,
    routing as never,
    promo as never,
    mockPlatformConfig(),
    redis as never,
    tripShare as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.rideSharePassenger.findFirst.mockResolvedValue(null);
    prisma.ride.findFirst.mockResolvedValue(null);
    prisma.ride.findMany.mockResolvedValue([]);
  });

  it('applique le multiplicateur pool sur l’estimation', async () => {
    const est = await service.estimateShared(-4.32, 15.31, -4.34, 15.33, VehicleType.STANDARD);
    expect(est.exclusiveFareCdf).toBe(10000);
    expect(est.estimatedFareCdf).toBe(6500);
    expect(est.shared).toBe(true);
    expect(est.savingsCdf).toBe(3500);
  });

  it('crée une course partagée si aucun match', async () => {
    prisma.ride.create.mockResolvedValue({
      id: 'r1',
      passengerId: 'u1',
      driverId: null,
      status: RideStatus.REQUESTED,
      vehicleType: VehicleType.STANDARD,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'A',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'B',
      estimatedFareCdf: 6500,
      finalFareCdf: null,
      distanceKm: 5,
      durationMin: 15,
      isShared: true,
      shareSeatsTotal: 3,
      completionPin: '1234',
      sharePassengers: [
        {
          id: 'b1',
          userId: 'u1',
          seats: 1,
          pickupLat: -4.32,
          pickupLng: 15.31,
          pickupAddress: 'A',
          dropoffLat: -4.34,
          dropoffLng: 15.33,
          dropoffAddress: 'B',
          fareCdf: 6500,
          status: RideSharePassengerStatus.WAITING,
          joinedAt: new Date(),
          pickedUpAt: null,
          droppedOffAt: null,
        },
      ],
    });

    const result = await service.requestShared('u1', {
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      pickupAddress: 'A',
      dropoffAddress: 'B',
    });

    expect(result.joined).toBe(false);
    expect(result.ride.isShared).toBe(true);
    expect(prisma.ride.create).toHaveBeenCalled();
    expect(redis.publish).toHaveBeenCalled();
  });

  it('refuse moto-taxi pour le Pool', async () => {
    await expect(
      service.requestShared('u1', {
        pickupLat: -4.32,
        pickupLng: 15.31,
        dropoffLat: -4.34,
        dropoffLng: 15.33,
        vehicleType: VehicleType.MOTO_TAXI,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/moto/i) });
  });
});
