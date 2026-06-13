import { DeliveriesService } from './deliveries.service';
import { CreateParcelDeliveryDto } from './deliveries.dto';
import { PricingService } from '../rides/pricing.service';
import { MovaHttpException } from '@mova/shared';

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

  const surcharges = {
    get: jest.fn().mockImplementation((type: string) => {
      if (type === 'DELIVERY_FOOD') return Promise.resolve({ baseFeeCdf: 3000, multiplier: 1.0 });
      if (type === 'DELIVERY_EXPRESS') return Promise.resolve({ baseFeeCdf: 0, multiplier: 1.35 });
      return Promise.resolve({ baseFeeCdf: 0, multiplier: 1.0 });
    }),
  };

  const service = new DeliveriesService(prisma as never, pricing, surcharges as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejette les coordonnées hors Kinshasa', async () => {
    await expect(
      service.estimateParcel({
        pickupLat: 0,
        pickupLng: 0,
        pickupAddress: 'Test',
        dropoffLat: -4.34,
        dropoffLng: 15.32,
        dropoffAddress: 'Kalamu',
        weightCategory: 'DOCUMENTS',
      }),
    ).rejects.toBeInstanceOf(MovaHttpException);
  });

  it('enrichit l\'estimation colis (CDF, communes, breakdown)', async () => {
    const result = await service.estimateParcel({
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      dropoffAddress: 'Kalamu',
      weightCategory: 'LARGE' satisfies CreateParcelDeliveryDto['weightCategory'],
    });
    expect(result.estimatedPriceCdf).toBe(15000);
    expect(result.currency).toBe('CDF');
    expect(result.city).toBe('Kinshasa');
    expect(result.priceBreakdown).toBeDefined();
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
