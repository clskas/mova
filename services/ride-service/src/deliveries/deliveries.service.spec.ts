import { WeightCategory } from '@prisma/client';
import { DeliveriesService } from './deliveries.service';
import { PricingService } from '../rides/pricing.service';

describe('DeliveriesService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(5),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 10000, formatted: '10 000 FC' }),
  } as unknown as PricingService;

  const prisma = {
    delivery: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    deliveryEvent: { create: jest.fn() },
    restaurant: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  };

  const service = new DeliveriesService(prisma as never, pricing);

  beforeEach(() => jest.clearAllMocks());

  it('applique le multiplicateur de poids pour colis', async () => {
    const result = await service.estimateParcel({
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      dropoffAddress: 'Kalamu',
      weightCategory: WeightCategory.LARGE,
    });
    expect(result.estimatedPriceCdf).toBe(15000);
    expect(result.weightMultiplier).toBe(1.5);
  });

  it('calcule le total repas = articles + frais livraison', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Chez Flore',
      lat: -4.31,
      lng: 15.3,
      isActive: true,
    });
    const result = await service.estimateFood({
      restaurantId: 'r1',
      items: [{ name: 'Poulet', quantity: 2, unitPriceCdf: 5000 }],
      deliveryAddress: 'Gombe',
      deliveryLat: -4.32,
      deliveryLng: 15.31,
    });
    expect(result.itemsSubtotalCdf).toBe(10000);
    expect(result.estimatedPriceCdf).toBeGreaterThan(10000);
  });
});
