import { RentalService } from './rental.service';

describe('RentalService', () => {
  const prisma = {
    rentalInquiry: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    rentalVehicle: { findMany: jest.fn(), findUnique: jest.fn() },
  };

  const service = new RentalService(prisma as never);

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
    });
    expect(result.days).toBe(2);
    expect(result.totalCdf).toBe(75000 * 2 + 150000);
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
    expect(result.breakdown.addOnsFeeCdf).toBe(13000);
  });

  it('ajoute frais kilométrage limité', async () => {
    const { start, end } = futureDates(2);
    prisma.rentalVehicle.findUnique.mockResolvedValue(baseVehicle);
    const result = await service.quote({
      vehicleId: 'v1',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      mileageType: 'LIMITED',
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
      vehicle: { name: 'RAV4', ownerName: 'Marie', ownerContactPhone: '+243898765432', ownerBadge: 'PRO' },
    });
    const result = await service.get('r1', 'user-1');
    expect(result.ownerContactPhone).toBe('+243898765432');
    expect(result.timeline).toHaveLength(4);
    expect(result.timeline[1].label).toBe('Confirmée');
    expect(result.timeline[1].completed).toBe(true);
  });
});
