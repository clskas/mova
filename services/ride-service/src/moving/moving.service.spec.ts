import { MovingService } from './moving.service';
import { PricingService } from '../rides/pricing.service';

jest.mock('../common/driver-eligibility.util', () => ({
  ...jest.requireActual('../common/driver-eligibility.util'),
  assertDriverCanReceiveJobs: jest.fn().mockResolvedValue({
    kycStatus: 'APPROVED',
    documentsStatus: { canOperate: true },
  }),
}));

describe('MovingService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(10),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 12000, totalCdf: 12000, surchargeCdf: 0 }),
    withInterCitySurcharge: jest.fn().mockImplementation((fare) => fare),
  } as unknown as PricingService;

  const prisma = {
    movingRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const surcharges = {
    get: jest.fn().mockResolvedValue({ baseFeeCdf: 15000, multiplier: 1.5, perUnitCdf: 8000 }),
  };

  const redis = { publish: jest.fn().mockResolvedValue(undefined) };

  const service = new MovingService(prisma as never, pricing, surcharges as never, redis as never);

  const dto = {
    volumeM3: 5,
    vehicleCategory: 'CAMION_15M3' as const,
    pickupLat: -4.32,
    pickupLng: 15.31,
    pickupAddress: 'Gombe',
    dropoffLat: -4.34,
    dropoffLng: 15.32,
    dropoffAddress: 'Limete',
  };

  it('estime un déménagement avec frais volume', async () => {
    const result = await service.estimate(dto);
    expect(result.estimatedPriceCdf).toBeGreaterThan(12000);
    expect(result.volumeM3).toBe(5);
    expect(result.currency).toBe('CDF');
  });

  it('crée une demande de déménagement', async () => {
    prisma.movingRequest.create.mockResolvedValue({ id: 'm1', status: 'PENDING' });
    const result = await service.create('user-1', dto);
    expect(result.moving.id).toBe('m1');
  });

  it('permet au chauffeur assigné de démarrer puis terminer', async () => {
    prisma.movingRequest.findUnique
      .mockResolvedValueOnce({ id: 'm1', driverId: 'driver-1', userId: 'user-1', status: 'ASSIGNED' })
      .mockResolvedValueOnce({ id: 'm1', driverId: 'driver-1', userId: 'user-1', status: 'IN_PROGRESS' });
    prisma.movingRequest.update
      .mockResolvedValueOnce({ id: 'm1', driverId: 'driver-1', userId: 'user-1', status: 'IN_PROGRESS', completedAt: null })
      .mockResolvedValueOnce({ id: 'm1', driverId: 'driver-1', userId: 'user-1', status: 'COMPLETED', completedAt: new Date() });

    const started = await service.updateStatusByDriver('m1', 'driver-1', 'IN_PROGRESS' as never);
    expect(started.moving.status).toBe('IN_PROGRESS');
    expect(redis.publish).toHaveBeenCalled();

    const done = await service.updateStatusByDriver('m1', 'driver-1', 'COMPLETED' as never);
    expect(done.moving.status).toBe('COMPLETED');
  });
});
