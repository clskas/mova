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
    computeRadiusKm: jest.fn().mockReturnValue(10),
  };
  const redis = { publish: jest.fn() };
  const trackingGateway = { broadcastRideStatus: jest.fn() };
  const trackingService = { getTrace: jest.fn().mockResolvedValue([]) };
  const commission = {
    get: jest.fn().mockResolvedValue({ platformPercent: 15, driverPercent: 85 }),
    splitGross: jest.fn().mockImplementation((gross: number, pct: number) => ({
      grossCdf: gross,
      platformFeeCdf: Math.ceil(gross * (pct / 100)),
      driverNetCdf: gross - Math.ceil(gross * (pct / 100)),
      platformPercent: pct,
      driverPercent: 100 - pct,
    })),
  };

  const tripShare = { generateCompletionPin: jest.fn().mockReturnValue('4321'), generateToken: jest.fn().mockReturnValue('abc'), shareExpiresAt: jest.fn().mockReturnValue(new Date()), buildShareUrl: jest.fn().mockReturnValue('http://localhost:3000/api/public/trips/abc') };
  const service = new RidesService(prisma as never, pricing as never, matching as never, redis as never, trackingGateway as never, trackingService as never, commission as never, tripShare as never);

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
    expect(trackingGateway.broadcastRideStatus).toHaveBeenCalledWith('ride-1', 'MATCHING');
  });

  it('records driver rejection without changing ride status', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      status: RideStatus.SEARCHING,
    });

    const result = await service.rejectRide('ride-1', 'driver-1');
    expect(prisma.rideEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rideId: 'ride-1', event: 'DRIVER_REJECTED' }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it('includes driver ETA in ride detail when chauffeur assigned', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: 'driver-1',
      vehicleId: 'v1',
      status: RideStatus.ACCEPTED,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      estimatedFareCdf: 6200,
      finalFareCdf: null,
      distanceKm: 4.5,
      durationMin: 11,
      acceptedAt: new Date(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
      ratings: [],
    });
    pricing.haversineKm.mockReturnValue(1.2);
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/internal/users/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ firstName: 'Jean', lastName: 'Kabila', phone: '+243900000020' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          userId: 'driver-1',
          ratingAvg: 4.8,
          totalRides: 10,
          currentLat: -4.325,
          currentLng: 15.315,
          vehicles: [{ id: 'v1', type: 'MOTO_TAXI', make: 'Honda', model: 'Ace', plateNumber: 'KIN-1', color: 'red' }],
        }),
      });
    }) as never;

    const result = await service.getRide('ride-1');
    expect(result.etaMinutes).toBeGreaterThanOrEqual(1);
    expect(result.driverDistanceKm).toBeGreaterThan(0);
    expect(result.driver).not.toBeNull();
    expect(result.driver?.name).toBe('Jean Kabila');
    expect(result.driver?.plateNumber).toBe('KIN-1');
  });

  it('cancels ride for passenger with reason', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      status: RideStatus.SEARCHING,
      vehicleType: VehicleType.MOTO_TAXI,
      acceptedAt: null,
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      estimatedFareCdf: 6200,
      finalFareCdf: null,
      distanceKm: 4.5,
      durationMin: 11,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.cancellationPolicy.findUnique.mockResolvedValue({
      vehicleType: VehicleType.MOTO_TAXI,
      freeCancelMinutes: 5,
      passengerFeeCdf: 2000,
    });
    prisma.ride.update.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      vehicleId: null,
      status: RideStatus.CANCELLED,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
      estimatedFareCdf: 6200,
      finalFareCdf: null,
      distanceKm: 4.5,
      durationMin: 11,
      cancelledAt: new Date(),
      cancelReason: 'Trop long',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.cancelRide('ride-1', 'p1', 'Trop long');
    expect(prisma.ride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RideStatus.CANCELLED, cancelReason: 'Trop long' }),
      }),
    );
    expect(result.ride.status).toBe('CANCELLED');
    expect(trackingGateway.broadcastRideStatus).toHaveBeenCalledWith('ride-1', 'CANCELLED');
  });
});
