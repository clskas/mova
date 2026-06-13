import { MovingService } from './moving.service';
import { PricingService } from '../rides/pricing.service';

describe('MovingService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(10),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 12000 }),
  } as unknown as PricingService;

  const prisma = {
    movingRequest: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const service = new MovingService(prisma as never, pricing);

  const dto = {
    volumeM3: 5,
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
});
