import { ErrandsService } from './errands.service';
import { PricingService } from '../rides/pricing.service';

describe('ErrandsService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(4),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 8000 }),
  } as unknown as PricingService;

  const prisma = {
    errandOrder: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  };

  const service = new ErrandsService(prisma as never, pricing);

  const dto = {
    description: 'Acheter pain et lait',
    pickupAddress: 'Marché Gambela',
    pickupLat: -4.32,
    pickupLng: 15.31,
    dropoffAddress: 'Gombe',
    dropoffLat: -4.31,
    dropoffLng: 15.3,
  };

  it('ajoute les frais de commission au tarif course', async () => {
    const result = await service.estimate(dto);
    expect(result.estimatedPriceCdf).toBe(10500);
    expect(result.errandFeeCdf).toBe(2500);
  });

  it('crée une commande courses avec statut PENDING', async () => {
    prisma.errandOrder.create.mockResolvedValue({ id: 'e1', status: 'PENDING', ...dto });
    const result = await service.create('user-1', dto);
    expect(result.order.status).toBe('PENDING');
    expect(prisma.errandOrder.create).toHaveBeenCalled();
  });
});
