import { CommissionServiceType } from '@prisma/client';
import { CommissionService } from './commission.service';

describe('CommissionService — driver / platform split', () => {
  const prisma = { platformCommission: { findUnique: jest.fn() } };
  const service = new CommissionService(prisma as never);

  beforeEach(() => prisma.platformCommission.findUnique.mockReset());

  it('platform fee + driver net always equal the fare (no franc lost or created)', () => {
    for (const gross of [0, 1, 99, 2300, 4999, 8500, 15000, 123457]) {
      for (const percent of [0, 10, 12, 15, 18, 20, 33, 100]) {
        const split = service.splitGross(gross, percent);
        expect(split.platformFeeCdf + split.driverNetCdf).toBe(gross);
        expect(split.platformFeeCdf).toBeGreaterThanOrEqual(0);
        expect(split.driverNetCdf).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rounds the platform fee up to the franc (15 % of 4999 = 750)', () => {
    expect(service.splitGross(4999, 15)).toMatchObject({ platformFeeCdf: 750, driverNetCdf: 4249 });
    expect(service.splitGross(10000, 15)).toMatchObject({ platformFeeCdf: 1500, driverNetCdf: 8500 });
  });

  it('clamps out-of-range rates so a driver payout is never negative', () => {
    expect(service.splitGross(10000, 120)).toMatchObject({ platformFeeCdf: 10000, driverNetCdf: 0 });
    expect(service.splitGross(10000, -5)).toMatchObject({ platformFeeCdf: 0, driverNetCdf: 10000 });
    expect(service.splitGross(10000, Number.NaN)).toMatchObject({ platformFeeCdf: 0, driverNetCdf: 10000 });
  });

  it('uses the documented default rates when no admin rule exists', async () => {
    prisma.platformCommission.findUnique.mockResolvedValue(null);
    const expected: Record<string, number> = {
      RIDE: 15, DELIVERY: 20, MOVING: 18, RENTAL: 12, CARPOOL: 10, ERRAND: 15, FOOD: 12,
    };
    for (const [type, percent] of Object.entries(expected)) {
      const rule = await service.get(type as CommissionServiceType);
      expect(rule.platformPercent).toBe(percent);
      expect(rule.driverPercent).toBe(100 - percent);
    }
  });

  it('applies the admin rule when active, the default when deactivated', async () => {
    prisma.platformCommission.findUnique.mockResolvedValueOnce({
      serviceType: 'RIDE', platformPercent: 20, driverPercent: 80, fixedFeeCdf: null,
      perItemFeeCdf: null, description: null, isActive: true,
    });
    await expect(service.splitForService(10000, 'RIDE' as CommissionServiceType)).resolves.toMatchObject({
      platformFeeCdf: 2000, driverNetCdf: 8000,
    });
    prisma.platformCommission.findUnique.mockResolvedValueOnce({
      serviceType: 'RIDE', platformPercent: 20, driverPercent: 80, fixedFeeCdf: null,
      perItemFeeCdf: null, description: null, isActive: false,
    });
    await expect(service.splitForService(10000, 'RIDE' as CommissionServiceType)).resolves.toMatchObject({
      platformFeeCdf: 1500, driverNetCdf: 8500,
    });
  });
});
