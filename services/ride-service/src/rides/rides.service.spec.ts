import { RideStatus, VehicleType } from '@prisma/client';
import { MOVA_EVENTS } from '@mova/shared';
import { RidesService } from './rides.service';

describe('RidesService', () => {
  const prisma = {
    ride: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    rideEvent: { create: jest.fn(), count: jest.fn() },
    cancellationPolicy: { findUnique: jest.fn() },
  };
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(4.5),
    estimateFare: jest.fn().mockResolvedValue({
      vehicleType: 'MOTO',
      distanceKm: 4.5,
      etaMinutes: 11,
      baseFareCdf: 1500,
      distanceFareCdf: 3600,
      durationFareCdf: 1100,
      surchargeCdf: 0,
      totalCdf: 6200,
      totalFormatted: '6 200 FC',
      estimatedFareCdf: 6200,
      estimatedPriceCdf: 6200,
      currency: 'CDF',
      surchargeMultiplier: 1,
    }),
    withInterCitySurcharge: jest.fn().mockImplementation((fare) => fare),
  };
  const matching = {
    findDrivers: jest.fn().mockResolvedValue([]),
    getMatchingMeta: jest.fn().mockReturnValue({ radiusKm: 2, nextRadiusKm: 3, incrementIntervalSec: 30, maxRadiusKm: 10 }),
  };
  const redis = { publish: jest.fn() };

  const service = new RidesService(prisma as never, pricing as never, matching as never, redis as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates ride in REQUESTED status without auto-matching', async () => {
    prisma.ride.findFirst.mockResolvedValue(null);
    prisma.ride.create.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      vehicleId: null,
      status: RideStatus.REQUESTED,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 6200,
      finalFareCdf: null,
      distanceKm: 4.5,
      durationMin: 11,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createRide('p1', {
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
    });

    expect(prisma.ride.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: RideStatus.REQUESTED }) }),
    );
    expect(result.status).toBe('REQUESTED');
    expect(result.vehicleType).toBe('MOTO');
    expect(redis.publish).toHaveBeenCalledWith(MOVA_EVENTS.RIDE_CREATED, expect.any(Object));
    expect(matching.findDrivers).not.toHaveBeenCalled();
  });

  it('transitions to MATCHING on search', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      status: RideStatus.REQUESTED,
      pickupLat: -4.32,
      pickupLng: 15.31,
      vehicleType: VehicleType.STANDARD,
    });
    prisma.rideEvent.count.mockResolvedValue(0);
    prisma.ride.update.mockResolvedValue({});
    matching.findDrivers.mockResolvedValue([{ driverId: 'd1', userId: 'u1', lat: -4.32, lng: 15.31, rating: 4.8, distanceKm: 0.5, score: 0.9 }]);

    const result = await service.searchDrivers('ride-1', 'p1');
    expect(prisma.ride.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: RideStatus.SEARCHING } }),
    );
    expect(result.status).toBe('MATCHING');
    expect(result.driversFound).toBe(1);
  });
});
