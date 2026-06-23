import { DeliveriesService } from './deliveries.service';
import { CreateParcelDeliveryDto } from './deliveries.dto';
import { PricingService } from '../rides/pricing.service';
import { MovaHttpException } from '@mova/shared';

describe('DeliveriesService', () => {
  const pricing = {
    haversineKm: jest.fn().mockReturnValue(1600),
    estimateFare: jest.fn().mockResolvedValue({ estimatedFareCdf: 10000, formatted: '10 000 FC', totalCdf: 10000, surchargeCdf: 0 }),
    withInterCitySurcharge: jest.fn().mockImplementation((fare, isInterCity) =>
      isInterCity ? { ...fare, estimatedFareCdf: fare.estimatedFareCdf + 20000, totalCdf: fare.totalCdf + 20000 } : fare,
    ),
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

  const promo = { validate: jest.fn() };
  const redis = { publish: jest.fn() };
  const trackingService = { getTrace: jest.fn().mockResolvedValue([]) };
  const matching = { findNearbyDrivers: jest.fn().mockResolvedValue([]) };

  const service = new DeliveriesService(
    prisma as never,
    pricing,
    surcharges as never,
    promo as never,
    redis as never,
    trackingService as never,
    matching as never,
  );

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
    expect(result.isInterCity).toBe(false);
    expect(result.priceBreakdown).toBeDefined();
  });

  it('accepte et majore un colis inter-villes', async () => {
    (pricing.haversineKm as jest.Mock).mockReturnValueOnce(1600);
    const result = await service.estimateParcel({
      pickupLat: -4.3217,
      pickupLng: 15.3125,
      pickupAddress: 'Gombe, Kinshasa',
      dropoffLat: -11.6647,
      dropoffLng: 27.4794,
      dropoffAddress: 'Centre, Lubumbashi',
      weightCategory: 'DOCUMENTS',
    });
    expect(result.isInterCity).toBe(true);
    expect(result.pickupCity).toBe('Kinshasa');
    expect(result.dropoffCity).toBe('Lubumbashi');
    expect(result.estimatedPriceCdf).toBeGreaterThan(20000);
  });

  it('calcule le total repas = articles + frais livraison', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      id: 'r1',
      name: 'Chez Flore',
      lat: -4.31,
      lng: 15.3,
      isActive: true,
      isAcceptingOrders: true,
      menuItems: [{ name: 'Poulet', priceCdf: 5000, isAvailable: true }],
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

  it('createParcel assigns a 4-digit delivery pin', async () => {
    prisma.delivery.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 'del-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    }));
    prisma.deliveryEvent.create.mockResolvedValue({});
    const dto = {
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      dropoffAddress: 'Kalamu',
      weightCategory: 'DOCUMENTS' as const,
    };
    await service.createParcel('u1', dto);
    expect(prisma.delivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryPin: expect.stringMatching(/^\d{4}$/),
        }),
      }),
    );
  });

  it('liste les restaurants Kinshasa pour des coords Gombe', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'Chez Flore',
        cuisine: 'Congolais',
        address: 'Gombe, Kinshasa',
        lat: -4.3105,
        lng: 15.3032,
        rating: 4.6,
        imageUrl: null,
        menuItems: [],
      },
      {
        id: 'r2',
        name: 'Le Roxy',
        cuisine: 'Grill',
        address: 'Lubumbashi',
        lat: -11.664,
        lng: 27.48,
        rating: 4.3,
        imageUrl: null,
        menuItems: [],
      },
    ]);
    const result = await service.listRestaurants(-4.3217, 15.3125);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Chez Flore');
    expect(result.data[0].deliveryEtaMin).toBeGreaterThan(0);
  });

  it('inclut les restaurants de la même ville même sans Kinshasa dans l\'adresse', async () => {
    prisma.restaurant.findMany.mockResolvedValue([
      {
        id: 'r1',
        name: 'Chez Flore',
        cuisine: 'Congolais',
        address: 'Gombe',
        lat: -4.3105,
        lng: 15.3032,
        rating: 4.6,
        imageUrl: null,
        menuItems: [],
      },
      {
        id: 'r2',
        name: 'Limoncello',
        cuisine: 'Italien',
        address: 'Malepe',
        lat: -4.335,
        lng: 15.29,
        rating: 4.5,
        imageUrl: null,
        menuItems: [],
      },
      {
        id: 'r3',
        name: 'Le Roxy',
        cuisine: 'Grill',
        address: 'Centre',
        lat: -11.664,
        lng: 27.48,
        rating: 4.3,
        imageUrl: null,
        menuItems: [],
      },
    ]);
    const result = await service.listRestaurants(-4.3217, 15.3125);
    expect(result.data.map((r) => r.name)).toEqual(['Chez Flore', 'Limoncello']);
  });
});
