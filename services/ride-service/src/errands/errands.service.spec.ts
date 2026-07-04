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
    errandOrder: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  };

  const redis = { publish: jest.fn().mockResolvedValue(1) };
  const trackingService = { getTrace: jest.fn().mockResolvedValue([]) };
  const tripShare = { generateCompletionPin: jest.fn().mockReturnValue('1234') };

  const matching = { findDrivers: jest.fn().mockResolvedValue([]) };
  const promo = {
    peek: jest.fn(),
    redeem: jest.fn(),
    applyDiscount: jest.fn((price: number) => price),
  };
  const routing = {
    resolveRoadDistance: jest.fn().mockResolvedValue({ distanceKm: 4, source: 'estimated' }),
    roadDistanceKm: jest.fn().mockResolvedValue(4),
  };
  const service = new ErrandsService(prisma as never, pricing, commission, redis as never, trackingService as never, tripShare as never, matching as never, promo as never, routing as never);

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
    const order = { id: 'e1', status: 'PENDING', category: 'OTHER', pickupAddress: dto.pickupAddress, pickupLat: dto.pickupLat, pickupLng: dto.pickupLng, estimatedPriceCdf: 10500, ...dto };
    prisma.errandOrder.create.mockResolvedValue(order);
    prisma.errandOrder.findUniqueOrThrow.mockResolvedValue(order);
    const result = await service.create('user-1', dto);
    expect(result.order.status).toBe('PENDING');
    expect(prisma.errandOrder.create).toHaveBeenCalled();
  });

  it('retourne une liste vide si le chauffeur est indisponible', async () => {
    const offers = await service.getDriverOffers('driver-offline');
    expect(offers.offers).toEqual([]);
  });
});
