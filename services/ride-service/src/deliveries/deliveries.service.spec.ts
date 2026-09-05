import { DeliveriesService } from './deliveries.service';
import { CreateParcelDeliveryDto } from './deliveries.dto';
import { PricingService } from '../rides/pricing.service';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { mockPlatformConfig } from '../platform/platform-config.mock';
import { PARCEL_WEIGHT_BAND_DEFAULTS } from '../platform/parcel-weight-band.service';
import { creditRestaurantEscrow, releaseEscrowPayout } from '../common/escrow.util';

jest.mock('../common/driver-eligibility.util', () => ({
  assertDriverEligibleForParcel: jest.fn().mockResolvedValue(undefined),
  assertDriverCanReceiveJobs: jest.fn().mockResolvedValue(undefined),
  driverCanReceiveJobs: jest.fn().mockReturnValue(true),
  fetchDriverProfileSnapshot: jest.fn().mockResolvedValue(null),
}));
jest.mock('../common/escrow.util', () => ({
  releaseEscrowPayout: jest.fn().mockResolvedValue({ success: true }),
  refundEscrow: jest.fn().mockResolvedValue({ success: true }),
  settleEscrowPartial: jest.fn().mockResolvedValue({ success: true }),
  freezeEscrow: jest.fn().mockResolvedValue({ success: true }),
  recordWalletEscrow: jest.fn().mockResolvedValue({ success: true }),
  creditRestaurantEscrow: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../common/sms-notify.util', () => ({
  sendPlatformSms: jest.fn().mockResolvedValue({ sent: true }),
  deliveryPinSms: jest.fn().mockReturnValue('PIN'),
}));
jest.mock('../common/internal-lookup.util', () => ({
  fetchAuthUserBrief: jest.fn().mockResolvedValue({ phone: '+243810000000' }),
}));

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
    restaurantDriver: { findUnique: jest.fn() },
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
  const commission = {
    get: jest.fn().mockResolvedValue({ platformPercent: 15 }),
    splitGross: jest.fn().mockImplementation((gross: number, percent: number) => ({
      driverNetCdf: Math.round(gross * (1 - percent / 100)),
      platformFeeCdf: Math.round(gross * (percent / 100)),
    })),
  };
  const routing = {
    resolveRoadDistance: jest.fn().mockResolvedValue({ distanceKm: 4.5, source: 'estimated' }),
    roadDistanceKm: jest.fn().mockResolvedValue(4.5),
  };

  const parcelWeightBands = {
    resolve: jest.fn().mockImplementation(async (weightKg?: number) => {
      const band = PARCEL_WEIGHT_BAND_DEFAULTS.find((b) => (weightKg ?? 0) <= b.maxKg) ?? PARCEL_WEIGHT_BAND_DEFAULTS[3];
      return { category: band.category, multiplier: band.multiplier };
    }),
    getMultiplier: jest.fn().mockImplementation(async (category: string) => {
      return PARCEL_WEIGHT_BAND_DEFAULTS.find((b) => b.category === category)?.multiplier ?? 1;
    }),
  };

  const service = new DeliveriesService(
    prisma as never,
    pricing,
    surcharges as never,
    promo as never,
    redis as never,
    trackingService as never,
    matching as never,
    commission as never,
    routing as never,
    mockPlatformConfig(),
    parcelWeightBands as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    commission.get.mockResolvedValue({ platformPercent: 15 });
    commission.splitGross.mockImplementation((gross: number, percent: number) => ({
      driverNetCdf: Math.round(gross * (1 - percent / 100)),
      platformFeeCdf: Math.round(gross * (percent / 100)),
    }));
  });

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

  it('filtre restaurants par cuisine, ETA, prix et distance', async () => {
    const restaurants = [
      {
        id: 'r1',
        name: 'Chez Flore',
        cuisine: 'Congolais',
        address: 'Gombe',
        lat: -4.3105,
        lng: 15.3032,
        rating: 4.6,
        imageUrl: null,
        menuItems: [{ name: 'Poulet', unitPriceCdf: 8000 }],
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
        menuItems: [{ name: 'Pizza', unitPriceCdf: 15000 }],
      },
    ];
    prisma.restaurant.findMany.mockImplementation(({ where }: { where?: { cuisine?: { contains?: string } } }) => {
      const cuisine = where?.cuisine?.contains?.toLowerCase();
      const rows = cuisine
        ? restaurants.filter((r) => r.cuisine.toLowerCase().includes(cuisine))
        : restaurants;
      return Promise.resolve(rows);
    });

    const byCuisine = await service.listRestaurants(-4.3217, 15.3125, 'Italien');
    expect(byCuisine.data.map((r) => r.name)).toEqual(['Limoncello']);

    const byPrice = await service.listRestaurants(-4.3217, 15.3125, undefined, undefined, 10000);
    expect(byPrice.data.map((r) => r.name)).toEqual(['Chez Flore']);

    const byEta = await service.listRestaurants(-4.3217, 15.3125, undefined, 25);
    expect(byEta.data).toHaveLength(0);

    const byDistance = await service.listRestaurants(-4.3217, 15.3125, undefined, undefined, undefined, 2);
    expect(byDistance.data).toHaveLength(0);

    const byDistanceWide = await service.listRestaurants(-4.3217, 15.3125, undefined, undefined, undefined, 10);
    expect(byDistanceWide.data).toHaveLength(2);
  });

  it('createParcel garanti : pas d\'alerte livreur avant séquestre', async () => {
    prisma.delivery.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 'del-escrow',
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    }));
    prisma.deliveryEvent.create.mockResolvedValue({});
    await service.createParcel('u1', {
      pickupLat: -4.32,
      pickupLng: 15.31,
      pickupAddress: 'Gombe',
      dropoffLat: -4.34,
      dropoffLng: 15.32,
      dropoffAddress: 'Kalamu',
      weightCategory: 'DOCUMENTS',
    });
    expect(prisma.delivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ guaranteed: true, escrowReady: false }),
      }),
    );
    expect(matching.findNearbyDrivers).not.toHaveBeenCalled();
  });

  it('refuse l\'assignation tant que le séquestre n\'est pas SUCCESS', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      type: 'PARCEL',
      status: 'PENDING',
      driverId: null,
      guaranteed: true,
      escrowReady: false,
      estimatedPriceCdf: 8000,
      weightCategory: 'DOCUMENTS',
    });
    await expect(service.acceptDelivery('d1', 'drv-1')).rejects.toMatchObject({
      code: MovaErrorCode.DELIVERY_ESCROW_REQUIRED,
    });
    expect(prisma.delivery.update).not.toHaveBeenCalled();
  });

  it('refuse DELIVERED si le PIN est faux (pas de versement)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: 'drv',
      status: 'IN_TRANSIT',
      type: 'PARCEL',
      guaranteed: true,
      deliveryPin: '4821',
      fundsFrozenAt: null,
      pinAttemptCount: 0,
    });
    prisma.delivery.update.mockResolvedValue({});
    await expect(service.updateStatus('d1', 'DELIVERED' as never, 'drv', '0000')).rejects.toBeInstanceOf(
      MovaHttpException,
    );
    expect(prisma.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pinAttemptCount: { increment: 1 } }) }),
    );
  });

  it('refuse l\'acceptation tant que le séquestre n\'est pas prêt', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: null,
      type: 'PARCEL',
      status: 'PENDING',
      guaranteed: true,
      escrowReady: false,
      estimatedPriceCdf: 8000,
      weightCategory: 'DOCUMENTS',
    });
    await expect(service.acceptDelivery('d1', 'drv')).rejects.toMatchObject({
      code: MovaErrorCode.DELIVERY_ESCROW_REQUIRED,
    });
    expect(prisma.delivery.update).not.toHaveBeenCalled();
  });

  it('OWN : un livreur externe ne peut pas prendre la commande', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: null,
      type: 'FOOD',
      status: 'READY_FOR_PICKUP',
      restaurantId: 'r1',
      guaranteed: true,
      escrowReady: true,
      escrowAmountCdf: 15000,
      estimatedPriceCdf: 15000,
    });
    prisma.restaurant.findUnique.mockResolvedValue({ courierMode: 'OWN' });
    prisma.restaurantDriver.findUnique.mockResolvedValue(null);
    await expect(service.acceptDelivery('d1', 'external-drv')).rejects.toBeInstanceOf(MovaHttpException);
    expect(prisma.delivery.update).not.toHaveBeenCalled();
  });

  it('PIN déjà livré : idempotent, pas de second split', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: 'drv',
      status: 'DELIVERED',
      type: 'PARCEL',
      guaranteed: true,
      payoutReleasedAt: new Date(),
      events: [],
      estimatedPriceCdf: 8000,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.updateStatus('d1', 'DELIVERED' as never, 'drv', '4821');
    expect(result.alreadyDelivered).toBe(true);
    expect(prisma.delivery.update).not.toHaveBeenCalled();
    expect(releaseEscrowPayout).not.toHaveBeenCalled();
  });

  it('PIN correct : split livreur (release escrow)', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: 'drv',
      status: 'IN_TRANSIT',
      type: 'PARCEL',
      guaranteed: true,
      deliveryPin: '4821',
      fundsFrozenAt: null,
      payoutReleasedAt: null,
      pinAttemptCount: 0,
      estimatedPriceCdf: 8000,
      pickupLat: -4.32,
      pickupLng: 15.31,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.delivery.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'd1',
      userId: 'u1',
      driverId: 'drv',
      type: 'PARCEL',
      status: data.status ?? 'DELIVERED',
      guaranteed: true,
      events: [],
      restaurant: null,
      estimatedPriceCdf: 8000,
      pickupLat: -4.32,
      pickupLng: 15.31,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    prisma.deliveryEvent.create.mockResolvedValue({});
    await service.updateStatus('d1', 'DELIVERED' as never, 'drv', '4821');
    expect(releaseEscrowPayout).toHaveBeenCalledWith('DELIVERY', 'd1');
  });

  it('repas : crédit resto à l\'enlèvement, indépendant du last-mile', async () => {
    prisma.delivery.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: null,
      type: 'FOOD',
      status: 'READY_FOR_PICKUP',
      restaurantId: 'r1',
      guaranteed: true,
      escrowReady: true,
      escrowAmountCdf: 15000,
      estimatedPriceCdf: 15000,
      deliveryPin: '1234',
      pickupLat: -4.32,
      pickupLng: 15.31,
    });
    prisma.restaurant.findUnique.mockResolvedValue({ courierMode: 'HYBRID' });
    prisma.restaurantDriver.findUnique.mockResolvedValue({ isActive: true });
    prisma.delivery.update.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      driverId: 'fleet-drv',
      type: 'FOOD',
      status: 'PICKED_UP',
      restaurantId: 'r1',
      restaurant: { name: 'Chez Mama', ownerUserId: 'own-1' },
      events: [],
      estimatedPriceCdf: 15000,
      pickupLat: -4.32,
      pickupLng: 15.31,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.deliveryEvent.create.mockResolvedValue({});
    await service.acceptDelivery('d1', 'fleet-drv');
    expect(creditRestaurantEscrow).toHaveBeenCalledWith('DELIVERY', 'd1');
    expect(releaseEscrowPayout).not.toHaveBeenCalled();
  });
});
