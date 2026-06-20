import { ErrandsService } from './errands.service';
import { PricingService } from '../rides/pricing.service';
import { CommissionService } from '../rides/commission.service';
import { CommissionServiceType } from '@prisma/client';

describe('ErrandsService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(4),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 8000 }),
  } as unknown as PricingService;

  const commission = {
    get: jest.fn().mockResolvedValue({
      serviceType: CommissionServiceType.ERRAND,
      platformPercent: 15,
      driverPercent: 85,
      fixedFeeCdf: 2500,
      perItemFeeCdf: 1500,
      description: 'Courses & commissions',
      isActive: true,
    }),
  } as unknown as CommissionService;

  const prisma = {
    errandOrder: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };

  const redis = { publish: jest.fn().mockResolvedValue(1) };
  const trackingService = { getTrace: jest.fn().mockResolvedValue([]) };
  const tripShare = { generateCompletionPin: jest.fn().mockReturnValue('1234') };

  const service = new ErrandsService(prisma as never, pricing, commission, redis as never, trackingService as never, tripShare as never);

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

  it('retourne une liste vide si le chauffeur est indisponible', async () => {
    const offers = await service.getDriverOffers('driver-offline');
    expect(offers.offers).toEqual([]);
  });
});
