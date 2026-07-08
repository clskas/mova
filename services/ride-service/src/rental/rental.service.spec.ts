import { RentalService } from './rental.service';

describe('RentalService', () => {
  const prisma = {
    rentalInquiry: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    rentalVehicle: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const redis = { publish: jest.fn().mockResolvedValue(1) };
  const promo = {
    peek: jest.fn(),
    redeem: jest.fn(),
    applyDiscount: jest.fn((price: number) => price),
  };
  const tripShare = { generateCompletionPin: jest.fn().mockReturnValue('1234') };

  const service = new RentalService(prisma as never, redis as never, promo as never, tripShare as never);

  const baseVehicle = {
    id: 'v1',
    name: 'Toyota RAV4',
    make: 'Toyota',
    model: 'RAV4',
    year: 2022,
    category: 'SUV',
    transmission: 'AUTO',
    city: 'Kinshasa',
    seats: 5,
    dailyRateCdf: 75000,
    depositCdf: 150000,
    weeklyDiscountPct: 10,
    rating: 4.8,
    ownerName: 'Marie L.',
    ownerBadge: 'SUPER_HOST',
    ownerContactPhone: '+243898765432',
    features: ['Climatisation', 'GPS'],
    cancellationPolicy: null,
    mileageUnlimited: true,
    limitedMileageFeeCdf: 20000,
    imageUrl: null,
    isActive: true,
  };

  function futureDates(days = 2) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return { start, end };
  }

  it('crée une demande de location avec message de confirmation', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalInquiry.create.mockResolvedValue({
      id: 'r1',
      status: 'PENDING',
      vehicleType: 'SUV',
      startDate: start,
      endDate: end,
      vehicle: null,
    });
    const result = await service.create('user-1', {
      vehicleType: 'SUV',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      pickupAddress: 'Gombe',
    });
    expect(result.inquiry.status).toBe('PENDING');
    expect(result.message).toContain('24h');
  });

  it('estime une location depuis le catalogue', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      mileageType: 'LIMITED',
    });
    expect(result.days).toBe(2);
    expect(result.totalCdf).toBe(75000 * 2 + 150000);
  });

  it('calcule un devis horaire', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(13, 0, 0, 0);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      rentalPeriod: 'HOURLY',
    });
    expect(result.rentalPeriod).toBe('HOURLY');
    expect(result.hours).toBe(4);
    expect(result.days).toBe(0);
    expect(result.breakdown.rentalFeeCdf).toBe(Math.ceil(75000 / 8) * 4);
    expect(result.breakdown.weeklyDiscountCdf).toBe(0);
  });

  it('applique remise hebdomadaire', async () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      rentalPeriod: 'WEEKLY',
    });
    expect(result.breakdown.weeklyDiscountCdf).toBeGreaterThan(0);
    expect(result.totalCdf).toBeLessThan(75000 * 7 + 150000);
  });

  it('ajoute frais inter-ville et assurance premium', async () => {
    const { start, end } = futureDates(3);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      pickupCity: 'Kinshasa',
      returnCity: 'Lubumbashi',
      insuranceTier: 'PREMIUM',
      addOns: { childSeat: true, gps: true },
    });
    expect(result.breakdown.interCityFeeCdf).toBe(15000);
    expect(result.breakdown.insuranceFeeCdf).toBeGreaterThan(0);
    expect(result.breakdown.addOnsFeeCdf).toBe(5000);
  });

  it('ne facture pas le GPS si déjà intégré au véhicule', async () => {
    const { start, end } = futureDates(3);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      addOns: { gps: true, childSeat: true },
    });
    expect(result.breakdown.addOnsFeeCdf).toBe(5000);
  });

  it('n\'ajoute pas de frais pour kilométrage limité (forfait inclus)', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      mileageType: 'LIMITED',
    });
    expect(result.breakdown.mileageFeeCdf).toBe(0);
  });

  it('majore le kilométrage illimité', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      mileageType: 'UNLIMITED',
    });
    expect(result.breakdown.mileageFeeCdf).toBe(20000);
  });

  it('filtre et trie le catalogue', async () => {
    prisma.rentalVehicle.findMany.mockResolvedValue([baseVehicle]);
    const result = await service.listVehicles({
      city: 'Kinshasa',
      category: 'suv',
      sort: 'rating',
    });
    expect(prisma.rentalVehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          city: { equals: 'Kinshasa', mode: 'insensitive' },
          category: { equals: 'SUV', mode: 'insensitive' },
        }),
        orderBy: [{ rating: 'desc' }, { dailyRateCdf: 'asc' }],
      }),
    );
    expect(result.data[0].ownerBadge).toBe('SUPER_HOST');
  });

  it('retourne timeline statut sur get inquiry', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalInquiry.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'user-1',
      status: 'CONFIRMED',
      vehicleId: 'v1',
      vehicleType: 'SUV',
      startDate: start,
      endDate: end,
      pickupAddress: 'Gombe',
      pickupCity: 'Kinshasa',
      returnCity: 'Kinshasa',
      rentalPeriod: 'DAILY',
      mileageType: 'UNLIMITED',
      insuranceTier: 'BASIC',
      addOns: {},
      contactPhone: '+243812345678',
      notes: null,
      estimatedPriceCdf: 300000,
      totalCdf: 300000,
      createdAt: new Date(),
      updatedAt: new Date(),
      logisticsMode: 'SELF_PASSENGER',
      passengerDriverName: null,
      passengerDriverPhone: null,
      ownerDriverName: null,
      ownerDriverPhone: null,
      driverId: null,
      vehicle: { name: 'RAV4', ownerName: 'Marie', ownerContactPhone: '+243898765432', ownerBadge: 'PRO' },
    });
    const result = await service.get('r1', 'user-1');
    expect(result.ownerContactPhone).toBe('+243898765432');
    expect(result.timeline).toHaveLength(5);
    expect(result.timeline[2].label).toBe('Confirmée');
    expect(result.timeline[2].completed).toBe(true);
    expect(result.nextStepHint).toContain('En cours');
    expect(result.canConfirmHandover).toBe(true);
    expect(result.canCancel).toBe(true);
  });

  it('indique canCancel false quand la location est en cours', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalInquiry.findUnique.mockResolvedValue({
      id: 'r1',
      userId: 'user-1',
      status: 'IN_PROGRESS',
      vehicleId: 'v1',
      vehicleType: 'SUV',
      startDate: start,
      endDate: end,
      pickupAddress: 'Gombe',
      pickupCity: 'Kinshasa',
      returnCity: 'Kinshasa',
      rentalPeriod: 'DAILY',
      mileageType: 'UNLIMITED',
      insuranceTier: 'BASIC',
      addOns: {},
      contactPhone: '+243812345678',
      notes: null,
      estimatedPriceCdf: 300000,
      totalCdf: 300000,
      createdAt: new Date(),
      updatedAt: new Date(),
      logisticsMode: 'SELF_PASSENGER',
      passengerDriverName: null,
      passengerDriverPhone: null,
      ownerDriverName: null,
      ownerDriverPhone: null,
      driverId: null,
      vehicle: { name: 'RAV4', ownerName: 'Marie', ownerContactPhone: '+243898765432', ownerBadge: 'PRO' },
    });
    const result = await service.get('r1', 'user-1');
    expect(result.canCancel).toBe(false);
  });

  it('passe en cours quand le passager confirme la réception', async () => {
    const { start, end } = futureDates(2);
    const inquiry = {
      id: 'r1',
      userId: 'user-1',
      status: 'CONFIRMED',
      vehicleId: 'v1',
      vehicleType: 'SUV',
      startDate: start,
      endDate: end,
      vehicle: { name: 'RAV4', ownerName: 'Marie', ownerContactPhone: '+243898765432', ownerBadge: 'PRO' },
    };
    prisma.rentalInquiry.findUnique.mockResolvedValue(inquiry);
    prisma.rentalInquiry.update.mockResolvedValue({ ...inquiry, status: 'IN_PROGRESS' });

    const result = await service.passengerConfirmHandover('r1', 'user-1');

    expect(prisma.rentalInquiry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IN_PROGRESS' } }),
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.canConfirmHandover).toBe(false);
  });

  it('démarre automatiquement à la date de début sur lecture', async () => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const end = new Date();
    end.setDate(end.getDate() + 2);
    const inquiry = {
      id: 'r1',
      userId: 'user-1',
      status: 'CONFIRMED',
      vehicleId: 'v1',
      vehicleType: 'SUV',
      startDate: start,
      endDate: end,
      pickupAddress: 'Gombe',
      pickupCity: 'Kinshasa',
      returnCity: 'Kinshasa',
      rentalPeriod: 'DAILY',
      mileageType: 'UNLIMITED',
      insuranceTier: 'BASIC',
      addOns: {},
      contactPhone: '+243812345678',
      notes: null,
      estimatedPriceCdf: 300000,
      totalCdf: 300000,
      createdAt: new Date(),
      updatedAt: new Date(),
      logisticsMode: 'SELF_PASSENGER',
      passengerDriverName: null,
      passengerDriverPhone: null,
      ownerDriverName: null,
      ownerDriverPhone: null,
      driverId: null,
      vehicle: { name: 'RAV4', ownerName: 'Marie', ownerContactPhone: '+243898765432', ownerBadge: 'PRO' },
    };
    prisma.rentalInquiry.findUnique.mockResolvedValue(inquiry);
    prisma.rentalInquiry.update.mockResolvedValue({ ...inquiry, status: 'IN_PROGRESS' });

    const result = await service.get('r1', 'user-1');

    expect(prisma.rentalInquiry.update).toHaveBeenCalled();
    expect(result.status).toBe('IN_PROGRESS');
  });
});
