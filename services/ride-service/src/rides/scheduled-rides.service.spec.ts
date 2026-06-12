import { VehicleType } from '@prisma/client';
import { MovaErrorCode } from '@mova/shared';
import { ScheduledRidesService } from './scheduled-rides.service';
import { PricingService } from './pricing.service';

describe('ScheduledRidesService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(3),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 8000 }),
  } as unknown as PricingService;

  const prisma = {
    scheduledRide: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const service = new ScheduledRidesService(prisma as never, pricing);

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
    });
    expect(result.scheduledRide.id).toBe('sr-1');
    expect(prisma.scheduledRide.create).toHaveBeenCalled();
  });
});
