import { VehicleType } from '@prisma/client';
import { MovaErrorCode } from '@mova/shared';
import { ScheduledRidesService } from './scheduled-rides.service';
import { PricingService } from './pricing.service';

describe('ScheduledRidesService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(3),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 8000, totalCdf: 8000, formatted: '8 000 FC', surchargeCdf: 0 }),
    withInterCitySurcharge: jest.fn().mockImplementation((fare) => fare),
  } as unknown as PricingService;

  const prisma = {
    scheduledRide: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const redis = { publish: jest.fn().mockResolvedValue(undefined) };
  const service = new ScheduledRidesService(prisma as never, pricing, redis as never);

  beforeEach(() => jest.clearAllMocks());

  it('refuse une date passée', async () => {
    await expect(
      service.create('user-1', {
        scheduledAt: new Date(Date.now() - 3600000).toISOString(),
        vehicleType: VehicleType.STANDARD,
        pickupLat: -4.32,
        pickupLng: 15.31,
        dropoffLat: -4.34,
        dropoffLng: 15.32,
      }),
    ).rejects.toMatchObject({ response: { code: MovaErrorCode.SCHEDULED_RIDE_PAST } });
  });

  it('refuse une date au-delà de J+7', async () => {
    const tooFar = new Date();
    tooFar.setDate(tooFar.getDate() + 8);
    await expect(
      service.create('user-1', {
        scheduledAt: tooFar.toISOString(),
        vehicleType: VehicleType.STANDARD,
        pickupLat: -4.32,
        pickupLng: 15.31,
        dropoffLat: -4.34,
        dropoffLng: 15.32,
      }),
    ).rejects.toMatchObject({ response: { code: MovaErrorCode.SCHEDULED_RIDE_TOO_FAR } });
  });

  it('crée une réservation valide', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 2);
    prisma.scheduledRide.create.mockResolvedValue({ id: 'sr-1', passengerId: 'user-1' });
    const result = await service.create('user-1', {
      scheduledAt: scheduledAt.toISOString(),
      vehicleType: VehicleType.MOTO_TAXI,
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      dropoffAddress: 'Limete, Kinshasa',
    });
    expect(result.scheduledRide.id).toBe('sr-1');
    expect(prisma.scheduledRide.create).toHaveBeenCalled();
  });

  it('estime une réservation Butembo valide (zone nationale)', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    const result = await service.estimateMobile({
      dropoffAddress: 'Butembo',
      vehicleType: VehicleType.STANDARD,
      scheduledAt: scheduledAt.toISOString(),
      pickupLat: 0.141,
      pickupLng: 29.291,
      dropoffLat: 0.145,
      dropoffLng: 29.295,
    });
    expect(result.estimatedPriceCdf).toBe(8000);
  });

  it('refuse des coords pickup hors zones MOVA', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    await expect(
      service.estimateMobile({
        dropoffAddress: 'Gombe, Kinshasa',
        vehicleType: VehicleType.STANDARD,
        scheduledAt: scheduledAt.toISOString(),
        pickupLat: 48.8566,
        pickupLng: 2.3522,
        dropoffLat: -4.3217,
        dropoffLng: 15.3125,
      }),
    ).rejects.toMatchObject({ response: { code: MovaErrorCode.VALIDATION_ERROR } });
  });

  it('estime une réservation inter-villes Kinshasa → Lubumbashi', async () => {
    (pricing.haversineKm as jest.Mock).mockReturnValueOnce(1600);
    (pricing.withInterCitySurcharge as jest.Mock).mockImplementationOnce((fare, isInterCity) =>
      isInterCity ? { ...fare, estimatedFareCdf: 28000, formatted: '28 000 FC' } : fare,
    );
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    const result = await service.estimateMobile({
      dropoffAddress: 'Lubumbashi',
      vehicleType: VehicleType.STANDARD,
      scheduledAt: scheduledAt.toISOString(),
      pickupLat: -4.3217,
      pickupLng: 15.3125,
      dropoffLat: -11.6647,
      dropoffLng: 27.4794,
    });
    expect(result.isInterCity).toBe(true);
    expect(result.estimatedPriceCdf).toBe(28000);
  });

  it('estime avec alias mobile MOTO / CONFORT', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    const result = await service.estimateMobile({
      dropoffAddress: 'Gombe, Kinshasa',
      vehicleType: VehicleType.MOTO_TAXI,
      scheduledAt: scheduledAt.toISOString(),
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.3217,
      dropoffLng: 15.3125,
    });
    expect(result.estimatedPriceCdf).toBe(8000);
  });

  it('estime une réservation Kinshasa valide', async () => {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    const result = await service.estimateMobile({
      dropoffAddress: 'Gombe, Kinshasa',
      vehicleType: VehicleType.STANDARD,
      scheduledAt: scheduledAt.toISOString(),
      pickupLat: -4.32,
      pickupLng: 15.31,
      dropoffLat: -4.3217,
      dropoffLng: 15.3125,
    });
    expect(result.estimatedPriceCdf).toBe(8000);
  });
});
