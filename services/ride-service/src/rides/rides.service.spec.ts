import { DeliveryStatus, DeliveryType, ErrandOrderStatus, RideStatus, RoundTripLeg, VehicleType } from '@prisma/client';
import { MOVA_EVENTS } from '@mova/shared';
import { RidesService } from './rides.service';
import { mockPlatformConfig } from '../platform/platform-config.mock';

jest.mock('../common/cancel-fee.util', () => ({
  collectCancelFee: jest.fn().mockResolvedValue({ collected: true, amountCdf: 0 }),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cancelFeeUtil = require('../common/cancel-fee.util') as { collectCancelFee: jest.Mock };
jest.mock('../common/internal-lookup.util', () => ({
  fetchAuthUserBrief: jest.fn().mockResolvedValue({ phone: '+243810000000' }),
}));

describe('RidesService', () => {
  const prisma = {
    rating: { findMany: jest.fn().mockResolvedValue([]) },
    ride: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    rideSharePassenger: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rideEvent: { create: jest.fn(), count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cancellationPolicy: { findUnique: jest.fn() },
    delivery: { findMany: jest.fn().mockResolvedValue([]) },
    errandOrder: { findMany: jest.fn().mockResolvedValue([]) },
    movingRequest: { count: jest.fn().mockResolvedValue(0) },
    scheduledRide: { count: jest.fn().mockResolvedValue(0) },
    carpoolTrip: { count: jest.fn().mockResolvedValue(0) },
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
  const trackingGateway = { broadcastRideStatus: jest.fn(), broadcastDriverJob: jest.fn() };
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
  const routing = {
    resolveRoadDistance: jest.fn().mockResolvedValue({ distanceKm: 4.5, source: 'estimated' }),
    roadDistanceKm: jest.fn().mockResolvedValue(4.5),
  };
  const service = new RidesService(
    prisma as never,
    pricing as never,
    matching as never,
    redis as never,
    trackingGateway as never,
    trackingService as never,
    commission as never,
    tripShare as never,
    { peek: jest.fn(), redeem: jest.fn(), applyDiscount: jest.fn((p: number) => p) } as never,
    routing as never,
    mockPlatformConfig(),
    {
      formatSharedRide: jest.fn((r: unknown) => r),
    } as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates ride in REQUESTED status without auto-matching', async () => {
    prisma.ride.findFirst.mockResolvedValue(null);
    prisma.ride.findMany.mockResolvedValue([]);
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

  it('lists nearby vehicles without exposing driver ids', async () => {
    matching.findDrivers.mockResolvedValue([
      { driverId: 'd1', userId: 'u1', lat: -4.321, lng: 15.313, rating: 4.8, distanceKm: 0.4, score: 0.9 },
    ]);
    const result = await service.listNearbyVehicles(-4.32, 15.31, VehicleType.MOTO_TAXI);
    expect(matching.findDrivers).toHaveBeenCalledWith(-4.32, 15.31, VehicleType.MOTO_TAXI, 0, { minSeats: 1 });
    expect(result.vehicleType).toBe('MOTO');
    expect(result.count).toBe(1);
    expect(result.vehicles[0]).toEqual(
      expect.objectContaining({ lat: -4.321, lng: 15.313, vehicleType: 'MOTO' }),
    );
    expect(result.vehicles[0]).not.toHaveProperty('driverId');
    expect(result.vehicles[0]).not.toHaveProperty('userId');
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
    expect(trackingGateway.broadcastDriverJob).toHaveBeenCalledWith(
      ['u1'],
      'ride:new',
      expect.objectContaining({ rideId: 'ride-1' }),
    );
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
      isShared: false,
      sharePassengers: [],
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

    const result = (await service.getRide('ride-1')) as {
      etaMinutes?: number | null;
      driverDistanceKm?: number | null;
      driver: { name?: string; plateNumber?: string } | null;
    };
    expect(result.etaMinutes).toBeGreaterThanOrEqual(1);
    expect(result.driverDistanceKm).toBeGreaterThan(0);
    expect(result.driver).not.toBeNull();
    expect(result.driver?.name).toBe('Jean Kabila');
    expect(result.driver?.plateNumber).toBe('KIN-1');
  });

  it('refuses ride detail to a user who is not passenger or driver', async () => {
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
      sharePassengers: [],
    });
    prisma.rideEvent.findMany.mockResolvedValue([]);
    await expect(service.getRide('ride-1', 'stranger')).rejects.toMatchObject({
      response: { code: 'MOVA_AUTH_003' },
    });
  });

  it('allows a notified (unassigned) driver to read ride status for cancel detection', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      vehicleId: null,
      status: RideStatus.CANCELLED,
      vehicleType: VehicleType.MOTO_TAXI,
      isShared: false,
      sharePassengers: [],
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
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: new Date(),
      cancelReason: 'passenger_cancel',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
      ratings: [],
    });
    prisma.rideEvent.findMany.mockResolvedValue([
      { metadata: { driverUserIds: ['driver-notified'] } },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as never;

    const result = (await service.getRide('ride-1', 'driver-notified')) as {
      status?: string;
      id?: string;
    };
    expect(result.id).toBe('ride-1');
    expect(String(result.status).toUpperCase()).toMatch(/CANCEL/);
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

  it('notifies matched drivers when passenger cancels an unmatched ride', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      status: RideStatus.SEARCHING,
      vehicleType: VehicleType.MOTO_TAXI,
      acceptedAt: null,
    });
    prisma.rideEvent.findMany.mockResolvedValue([
      { metadata: { driverUserIds: ['d1', 'd2'] } },
    ]);
    prisma.cancellationPolicy.findUnique.mockResolvedValue(null);
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.cancelRide('ride-1', 'p1', 'Annulé par le passager');
    expect(trackingGateway.broadcastDriverJob).toHaveBeenCalledWith(
      ['d1', 'd2'],
      'ride:cancelled',
      { rideId: 'ride-1' },
    );
  });

  it('refuses unmatched cancel from anyone except the passenger', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'ride-1',
      passengerId: 'p1',
      driverId: null,
      status: RideStatus.SEARCHING,
      vehicleType: VehicleType.MOTO_TAXI,
    });
    await expect(service.cancelRide('ride-1', 'stranger', 'nope')).rejects.toMatchObject({
      response: { code: 'MOVA_AUTH_003' },
    });
  });

  it('doubles estimate fare for roundTrip', async () => {
    const oneWay = await service.estimate(-4.32, 15.31, -4.34, 15.33, VehicleType.MOTO_TAXI);
    const roundTrip = await service.estimate(
      -4.32,
      15.31,
      -4.34,
      15.33,
      VehicleType.MOTO_TAXI,
      undefined,
      false,
      true,
    );
    expect(oneWay.roundTrip).toBe(false);
    expect(roundTrip.roundTrip).toBe(true);
    expect(roundTrip.estimatedFareCdf).toBe(oneWay.estimatedFareCdf * 2);
    expect(roundTrip.distanceKm).toBeCloseTo(oneWay.distanceKm * 2, 5);
    expect(roundTrip.etaMinutes).toBe(oneWay.etaMinutes * 2);
    expect(roundTrip.oneWayFareCdf).toBe(oneWay.estimatedFareCdf);
  });

  it('creates roundTrip ride with OUTBOUND leg', async () => {
    prisma.ride.findFirst.mockResolvedValue(null);
    prisma.ride.findMany.mockResolvedValue([]);
    prisma.ride.create.mockResolvedValue({
      id: 'ride-ar-1',
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
      estimatedFareCdf: 12400,
      finalFareCdf: null,
      distanceKm: 9,
      durationMin: 22,
      roundTrip: true,
      roundTripLeg: RoundTripLeg.OUTBOUND,
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
      roundTrip: true,
    });

    expect(prisma.ride.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roundTrip: true,
          roundTripLeg: RoundTripLeg.OUTBOUND,
          estimatedFareCdf: 12400,
        }),
      }),
    );
    expect(result.roundTrip).toBe(true);
    expect(result.roundTripLeg).toBe(RoundTripLeg.OUTBOUND);
    expect(result.roundTripPhase).toBe('OUTBOUND');
  });

  it('switches outbound COMPLETED to RETURN without closing the ride', async () => {
    const baseRide = {
      id: 'ride-ar-1',
      passengerId: 'p1',
      driverId: 'd1',
      vehicleId: 'v1',
      status: RideStatus.IN_PROGRESS,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 12400,
      finalFareCdf: null,
      distanceKm: 9,
      durationMin: 22,
      roundTrip: true,
      roundTripLeg: RoundTripLeg.OUTBOUND,
      acceptedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      completionPin: '4321',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.ride.findUnique.mockResolvedValue(baseRide);
    prisma.ride.update.mockResolvedValue({
      ...baseRide,
      roundTripLeg: RoundTripLeg.RETURN,
    });

    const result = await service.updateStatus('ride-ar-1', 'COMPLETED', 'd1');

    expect(prisma.ride.update).toHaveBeenCalledWith({
      where: { id: 'ride-ar-1', status: RideStatus.IN_PROGRESS, roundTripLeg: RoundTripLeg.OUTBOUND },
      data: { roundTripLeg: RoundTripLeg.RETURN },
    });
    expect(prisma.rideEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: 'ROUND_TRIP_RETURN' }),
      }),
    );
    expect(result).toMatchObject({
      roundTripReturnStarted: true,
      paymentReady: false,
      roundTripLeg: RoundTripLeg.RETURN,
      roundTripPhase: 'RETURN',
      activeDestinationLat: -4.32,
      status: 'IN_PROGRESS',
    });
    expect(redis.publish).not.toHaveBeenCalledWith(MOVA_EVENTS.RIDE_COMPLETED, expect.anything());
  });

  it('completes roundTrip on second COMPLETED while on RETURN leg', async () => {
    const baseRide = {
      id: 'ride-ar-1',
      passengerId: 'p1',
      driverId: 'd1',
      vehicleId: 'v1',
      status: RideStatus.IN_PROGRESS,
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 12400,
      finalFareCdf: null,
      distanceKm: 9,
      durationMin: 22,
      roundTrip: true,
      roundTripLeg: RoundTripLeg.RETURN,
      acceptedAt: new Date(),
      startedAt: new Date(),
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      completionPin: '4321',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.ride.findUnique.mockResolvedValue(baseRide);
    prisma.ride.update.mockResolvedValue({
      ...baseRide,
      status: RideStatus.COMPLETED,
      completedAt: new Date(),
      finalFareCdf: 12400,
    });

    const result = await service.updateStatus('ride-ar-1', 'COMPLETED', 'd1');

    expect(prisma.ride.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RideStatus.COMPLETED, finalFareCdf: 12400 }),
      }),
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.paymentReady).toBe(true);
    expect(redis.publish).toHaveBeenCalledWith(
      MOVA_EVENTS.RIDE_COMPLETED,
      expect.objectContaining({ rideId: 'ride-ar-1' }),
    );
  });

  it('driver card: the vehicle of the ride, the photo through the ride', () => {
    const s = service as unknown as {
      pickRideVehicle: (v: unknown[], r?: unknown) => { id: string } | undefined;
      driverPhotoUrl: (u: string | null, rideId?: string) => string | null;
    };
    const vehicles = [
      { id: 'old', type: 'STANDARD', isActive: false, typeApprovalStatus: 'APPROVED' },
      { id: 'moto', type: 'MOTO_TAXI', isActive: true, typeApprovalStatus: 'APPROVED' },
      { id: 'car', type: 'STANDARD', isActive: true, typeApprovalStatus: 'APPROVED' },
    ];
    expect(s.pickRideVehicle(vehicles, { vehicleId: 'moto', vehicleType: 'STANDARD' })?.id).toBe('moto');
    expect(s.pickRideVehicle(vehicles, { vehicleId: null, vehicleType: 'STANDARD' })?.id).toBe('car');
    expect(s.pickRideVehicle(vehicles, { vehicleId: 'someone-else', vehicleType: 'VIP' })?.id).toBe('moto');
    expect(s.driverPhotoUrl('/api/uploads/kyc/abc.jpg', 'r1')).toBe('/api/rides/r1/driver-photo');
    expect(s.driverPhotoUrl('https://lh3.googleusercontent.com/x', 'r1')).toBe('https://lh3.googleusercontent.com/x');
    expect(s.driverPhotoUrl(null, 'r1')).toBeNull();
  });

  it('driverPhotoSource: only the people on the ride', async () => {
    prisma.ride.findUnique.mockResolvedValue({ id: 'r1', passengerId: 'p1', driverId: 'd1', sharePassengers: [] });
    await expect(service.driverPhotoSource('r1', 'stranger')).rejects.toThrow();
  });

  it('owed cancellation fees: taken from the wallet before a new ride', async () => {
    prisma.ride.findMany.mockResolvedValueOnce([{ id: 'old', driverId: 'd1', cancellationFeeCdf: 2000 }]);
    cancelFeeUtil.collectCancelFee.mockResolvedValueOnce({ collected: true, amountCdf: 2000 });
    await service.settleOwedCancelFees('p1');
    expect(prisma.ride.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'old' }, data: expect.objectContaining({ cancelFeeStatus: 'PAID' }) }),
    );
  });

  it('owed cancellation fees: not enough balance refuses the new ride with the amount', async () => {
    prisma.ride.findMany.mockResolvedValueOnce([{ id: 'old', driverId: 'd1', cancellationFeeCdf: 2000 }]);
    cancelFeeUtil.collectCancelFee.mockResolvedValueOnce({ collected: false, amountCdf: 2000 });
    await expect(service.settleOwedCancelFees('p1')).rejects.toThrow('Frais d’annulation impayés');
  });

  it('updateStatus: the passenger cannot advance the trip steps', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'r-p',
      passengerId: 'p1',
      driverId: 'd1',
      status: RideStatus.IN_PROGRESS,
      roundTrip: false,
    });
    await expect(service.updateStatus('r-p', 'COMPLETED', 'p1')).rejects.toThrow(
      'Seul le chauffeur fait avancer la course.',
    );
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('updateStatus: CANCELLED goes through the normal cancel rules', async () => {
    prisma.ride.findUnique.mockResolvedValue({
      id: 'r-c',
      passengerId: 'p1',
      driverId: 'd1',
      status: RideStatus.ACCEPTED,
      roundTrip: false,
    });
    const cancelSpy = jest.spyOn(service, 'cancelRide').mockResolvedValue({
      ride: { id: 'r-c', status: 'CANCELLED' },
      cancellationFeeCdf: 0,
      cancellationFeeFormatted: '0 FC',
      message: 'Annulation gratuite.',
      cancelledByRole: 'passenger',
    } as never);
    const result = await service.updateStatus('r-c', 'CANCELLED', 'p1');
    expect(cancelSpy).toHaveBeenCalledWith('r-c', 'p1');
    expect(result).toMatchObject({ status: 'CANCELLED', paymentReady: false });
    expect(prisma.ride.update).not.toHaveBeenCalled();
  });

  it('findPassengerUnpaidRide: Pool payé via ServicePayment ne bloque plus', async () => {
    const sharedRide = {
      id: 'pool-1',
      passengerId: 'p1',
      driverId: 'd1',
      vehicleId: null,
      status: RideStatus.COMPLETED,
      vehicleType: VehicleType.STANDARD,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 4000,
      finalFareCdf: 4000,
      distanceKm: 3,
      durationMin: 10,
      isShared: true,
      acceptedAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      cancelledAt: null,
      cancelReason: null,
      completionPin: '1111',
      roundTrip: false,
      roundTripLeg: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.ride.findMany.mockResolvedValue([sharedRide]);
    prisma.rideSharePassenger.findFirst.mockResolvedValue({ id: 'booking-1' });
    prisma.rideSharePassenger.findMany.mockResolvedValue([]);
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (String(url).includes('/internal/services/RIDE_SHARE/booking-1/payment-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            referenceType: 'RIDE_SHARE',
            referenceId: 'booking-1',
            isPaid: true,
            paymentStatus: 'COMPLETED',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const result = await service.findPassengerUnpaidRide('p1');
    expect(result.ride).toBeNull();
    expect(prisma.rideSharePassenger.findFirst).toHaveBeenCalled();
  });

  it('findPassengerUnpaidRide: Pool non payé reste bloquant', async () => {
    const sharedRide = {
      id: 'pool-2',
      passengerId: 'p1',
      driverId: 'd1',
      vehicleId: null,
      status: RideStatus.COMPLETED,
      vehicleType: VehicleType.STANDARD,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 4000,
      finalFareCdf: 4000,
      distanceKm: 3,
      durationMin: 10,
      isShared: true,
      acceptedAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      cancelledAt: null,
      cancelReason: null,
      completionPin: '1111',
      roundTrip: false,
      roundTripLeg: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.ride.findMany.mockResolvedValue([sharedRide]);
    prisma.rideSharePassenger.findFirst.mockResolvedValue({ id: 'booking-2' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        referenceType: 'RIDE_SHARE',
        referenceId: 'booking-2',
        isPaid: false,
        paymentStatus: 'PENDING',
      }),
    });

    const result = await service.findPassengerUnpaidRide('p1');
    expect(result.ride).not.toBeNull();
    expect(result.ride?.isPaid).toBe(false);
    expect(result.ride?.type).toBe('RIDE_SHARE');
  });

  it('excludes cancelled deliveries from report delivery revenue', async () => {
    prisma.ride.findMany.mockResolvedValue([]);
    prisma.delivery.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        status: DeliveryStatus.CANCELLED,
        type: DeliveryType.FOOD,
        finalPriceCdf: null,
        estimatedPriceCdf: 25400,
        pickupLat: 0.5,
        pickupLng: 29.47,
      },
      {
        createdAt: new Date(),
        status: DeliveryStatus.CANCELLED,
        type: DeliveryType.FOOD,
        finalPriceCdf: null,
        estimatedPriceCdf: 26982,
        pickupLat: 0.5,
        pickupLng: 29.47,
      },
      {
        createdAt: new Date(),
        status: DeliveryStatus.DELIVERED,
        type: DeliveryType.PARCEL,
        finalPriceCdf: 5000,
        estimatedPriceCdf: 5000,
        pickupLat: 0.5,
        pickupLng: 29.47,
      },
    ]);
    prisma.errandOrder.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        status: ErrandOrderStatus.CANCELLED,
        finalPriceCdf: 9000,
        pickupLat: 0.5,
        pickupLng: 29.47,
      },
    ]);

    const report = await service.getReportAnalytics(30);
    expect(report.kpis.deliveryRevenueCdf).toBe(5000);
    expect(report.kpis.totalDeliveries).toBe(4);
  });

  it('getReportAnalytics accepts a custom from/to range', async () => {
    prisma.ride.findMany.mockResolvedValue([]);
    prisma.delivery.findMany.mockResolvedValue([]);
    prisma.errandOrder.findMany.mockResolvedValue([]);
    prisma.movingRequest.count.mockResolvedValue(0);
    prisma.scheduledRide.count.mockResolvedValue(0);
    prisma.carpoolTrip.count.mockResolvedValue(0);

    const report = await service.getReportAnalytics(30, null, {
      from: '2026-10-01',
      to: '2026-10-07',
    });
    expect(report.periodFrom).toBe('2026-10-01');
    expect(report.periodTo).toBe('2026-10-07');
    expect(report.periodDays).toBe(7);
    expect(report.daily).toHaveLength(7);
  });

  it('getReportAnalytics leaves test accounts out and explains cancellations', async () => {
    const now = new Date();
    const ride = (o: Record<string, unknown>) => ({
      createdAt: now, vehicleType: VehicleType.STANDARD, finalFareCdf: 5000, estimatedFareCdf: 5000, discountCdf: 0,
      pickupLat: -4.32, pickupLng: 15.31, driverId: null, cancelledBy: null, cancelReason: null, ...o,
    });
    prisma.ride.findMany.mockResolvedValue([
      ride({ status: RideStatus.COMPLETED, passengerId: 'real1', driverId: 'd1' }),
      ride({ status: RideStatus.CANCELLED, passengerId: 'real2', cancelledBy: 'real2', cancelReason: 'Trop long' }),
      ride({ status: RideStatus.CANCELLED, passengerId: 'real3', driverId: 'd2', cancelledBy: 'd2' }),
      ride({ status: RideStatus.CANCELLED, passengerId: 'apple-demo', cancelledBy: 'apple-demo' }),
    ]);
    prisma.delivery.findMany.mockResolvedValue([]);
    prisma.errandOrder.findMany.mockResolvedValue([]);
    prisma.movingRequest.count.mockResolvedValue(0);
    prisma.scheduledRide.count.mockResolvedValue(0);
    prisma.carpoolTrip.count.mockResolvedValue(0);
    const prevFetch = global.fetch;
    // Earlier tests may have cached another answer for 5 minutes.
    (service as unknown as { testAccountsCache?: unknown }).testAccountsCache = undefined;
    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ids: ['apple-demo'] }),
    });
    try {
      const report = await service.getReportAnalytics(30);
      expect(report.kpis.totalRides).toBe(3);
      expect(report.excludedTests).toEqual({ rides: 1, deliveries: 0, errands: 0 });
      expect(report.cancellations).toMatchObject({ passengerBeforeAccept: 1, driver: 1, passengerAfterAccept: 0 });
      expect(report.cancellations.topReasons[0]).toEqual({ reason: 'Trop long', count: 1 });
      const all = await service.getReportAnalytics(30, null, undefined, { includeTests: true });
      expect(all.kpis.totalRides).toBe(4);
    } finally {
      (global as unknown as { fetch: typeof fetch | undefined }).fetch = prevFetch;
    }
  });

  describe('nombre de passagers (voiture)', () => {
    const flags = { passengerCountEnabled: true, familialeEnabled: false };
    const clientApps = { get: () => ({ features: { sengaPlusVisible: true, ...flags } }) };
    const groupService = new RidesService(
      prisma as never,
      pricing as never,
      matching as never,
      redis as never,
      trackingGateway as never,
      trackingService as never,
      commission as never,
      tripShare as never,
      { peek: jest.fn(), redeem: jest.fn(), applyDiscount: jest.fn((p: number) => p) } as never,
      routing as never,
      mockPlatformConfig(),
      { formatSharedRide: jest.fn((r: unknown) => r) } as never,
      clientApps as never,
    );
    const searchingRide = (passengerCount: number) => ({
      id: 'ride-g',
      passengerId: 'p1',
      driverId: null,
      vehicleId: null,
      status: RideStatus.SEARCHING,
      vehicleType: VehicleType.STANDARD,
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      dropoffAddress: 'Limete',
      estimatedFareCdf: 9000,
      finalFareCdf: null,
      distanceKm: 4.5,
      durationMin: 11,
      roundTrip: false,
      roundTripLeg: null,
      passengerCount,
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });
    const driverWith = (passengerSeats: number | null) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userId: 'driver-1',
          isAvailable: true,
          kycStatus: 'APPROVED',
          activationPinVerified: true,
          documentsStatus: { canOperate: true },
          currentLat: -4.321,
          currentLng: 15.311,
          vehicles: [{ id: 'v1', type: 'STANDARD', isActive: true, typeApprovalStatus: 'APPROVED', passengerSeats }],
        }),
      }) as never;
    };
    const baseCreate = {
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.33,
      pickupAddress: 'Gombe',
      dropoffAddress: 'Limete',
    };

    beforeEach(() => {
      flags.passengerCountEnabled = true;
      flags.familialeEnabled = false;
      Object.assign(trackingGateway, { broadcastOfferTaken: jest.fn() });
      prisma.ride.findFirst.mockResolvedValue(null);
      prisma.ride.findMany.mockResolvedValue([]);
      prisma.ride.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...searchingRide(1),
        ...data,
        id: 'ride-new',
      }));
    });

    it('stores the group size when the feature is on', async () => {
      const result = await groupService.createRide('p1', {
        ...baseCreate,
        vehicleType: VehicleType.STANDARD,
        passengerCount: 3,
      });
      expect(prisma.ride.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passengerCount: 3 }) }),
      );
      expect(result.passengerCount).toBe(3);
    });

    it('refuses a Familiale ride while its switch is off', async () => {
      await expect(
        groupService.createRide('p1', { ...baseCreate, vehicleType: VehicleType.FAMILIALE, passengerCount: 6 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ message: expect.stringContaining('Familiale') }),
      });
      expect(prisma.ride.create).not.toHaveBeenCalled();
    });

    it('books a Familiale ride for a group of 7 when the switch is on', async () => {
      flags.familialeEnabled = true;
      const result = await groupService.createRide('p1', {
        ...baseCreate,
        vehicleType: VehicleType.FAMILIALE,
        passengerCount: 7,
      });
      expect(prisma.ride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ vehicleType: VehicleType.FAMILIALE, passengerCount: 7 }),
        }),
      );
      expect(result.passengerCount).toBe(7);
    });

    it('lets a Familiale vehicle (6 seats by default) take a Standard group of 5', async () => {
      prisma.ride.findUnique.mockResolvedValue(searchingRide(5));
      prisma.ride.update.mockResolvedValue({ ...searchingRide(5), status: RideStatus.ACCEPTED, driverId: 'driver-1' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          userId: 'driver-1',
          isAvailable: true,
          kycStatus: 'APPROVED',
          activationPinVerified: true,
          documentsStatus: { canOperate: true },
          currentLat: -4.321,
          currentLng: 15.311,
          vehicles: [{ id: 'v9', type: 'FAMILIALE', isActive: true, typeApprovalStatus: 'APPROVED', passengerSeats: null }],
        }),
      }) as never;
      const result = await groupService.acceptRide('ride-g', 'driver-1');
      expect(result.passengerCount).toBe(5);
    });

    it('forces 1 passenger on a moto and when the feature is off', async () => {
      await groupService.createRide('p1', { ...baseCreate, vehicleType: VehicleType.MOTO_TAXI, passengerCount: 3 });
      expect(prisma.ride.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passengerCount: 1 }) }),
      );
      flags.passengerCountEnabled = false;
      await groupService.createRide('p1', { ...baseCreate, vehicleType: VehicleType.STANDARD, passengerCount: 5 });
      expect(prisma.ride.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passengerCount: 1 }) }),
      );
    });

    it('searches only vehicles with enough seats', async () => {
      prisma.ride.findUnique.mockResolvedValue(searchingRide(6));
      prisma.rideEvent.count.mockResolvedValue(0);
      matching.findDrivers.mockResolvedValue([]);
      await groupService.autoSearchDrivers('ride-g');
      expect(matching.findDrivers).toHaveBeenCalledWith(-4.32, 15.31, VehicleType.STANDARD, 0, { minSeats: 6 });

      flags.passengerCountEnabled = false;
      await groupService.autoSearchDrivers('ride-g');
      expect(matching.findDrivers).toHaveBeenLastCalledWith(-4.32, 15.31, VehicleType.STANDARD, 0, { minSeats: 1 });
    });

    it('refuses acceptance by a car too small for the group', async () => {
      prisma.ride.findUnique.mockResolvedValue(searchingRide(6));
      driverWith(null); // STANDARD default = 4 seats
      await expect(groupService.acceptRide('ride-g', 'driver-1')).rejects.toMatchObject({
        response: expect.objectContaining({ message: expect.stringContaining('6 passagers') }),
      });
      expect(prisma.ride.update).not.toHaveBeenCalled();
    });

    it('lets a declared 7-seat car accept a group of 6', async () => {
      prisma.ride.findUnique.mockResolvedValue(searchingRide(6));
      prisma.ride.update.mockResolvedValue({ ...searchingRide(6), status: RideStatus.ACCEPTED, driverId: 'driver-1' });
      driverWith(7);
      const result = await groupService.acceptRide('ride-g', 'driver-1');
      expect(result.passengerCount).toBe(6);
    });

    it('hides group offers from drivers whose car is too small', async () => {
      prisma.ride.findMany.mockResolvedValue([searchingRide(6), { ...searchingRide(2), id: 'ride-2' }]);
      driverWith(null);
      const small = await groupService.getDriverOffers('driver-1');
      expect(small.offers.map((o) => o.id)).toEqual(['ride-2']);
      driverWith(7);
      const big = await groupService.getDriverOffers('driver-1');
      expect(big.offers.map((o) => o.id).sort()).toEqual(['ride-2', 'ride-g']);
    });
  });
});
