import { VehicleType } from '@prisma/client';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PricingService', () => {
  const prisma = {
    pricingRule: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;

  const service = new PricingService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.pricingRule.findUnique as jest.Mock).mockResolvedValue({
      vehicleType: VehicleType.MOTO_TAXI,
      baseFareCdf: 1500,
      perKmCdf: 800,
      perMinuteCdf: 100,
      minFareCdf: 2000,
      peakMultiplier: 1.3,
      nightMultiplier: 1.2,
    });
  });

  it('returns mobile fare breakdown for Kinshasa moto-taxi', async () => {
    const fare = await service.estimateFare(VehicleType.MOTO_TAXI, 3.2, 12);
    expect(fare.vehicleType).toBe('MOTO');
    expect(fare.distanceKm).toBe(3.2);
    expect(fare.etaMinutes).toBe(12);
    expect(fare.baseFareCdf).toBe(1500);
    expect(fare.totalCdf).toBeGreaterThanOrEqual(2000);
    expect(fare.totalFormatted).toContain('FC');
  });

  it('computes haversine distance', () => {
    const km = service.haversineKm(-4.3217, 15.3125, -4.3389, 15.3264);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(5);
  });

  it('applique les multiplicateurs pointe/nuit depuis la règle DB', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T08:00:00')); // heure de pointe
    (prisma.pricingRule.findUnique as jest.Mock).mockResolvedValue({
      vehicleType: VehicleType.STANDARD,
      baseFareCdf: 3000,
      perKmCdf: 1500,
      perMinuteCdf: 200,
      minFareCdf: 5000,
      peakMultiplier: 1.4,
      nightMultiplier: 1.25,
    });
    const fare = await service.estimateFare(VehicleType.STANDARD, 2, 10);
    expect(fare.surchargeMultiplier).toBe(1.4);
    jest.useRealTimers();
  });
});
