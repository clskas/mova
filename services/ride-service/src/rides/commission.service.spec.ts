import { CommissionServiceType } from '@prisma/client';
import { CommissionService } from './commission.service';

describe('CommissionService.splitGross', () => {
  const prisma = {
    platformCommission: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const service = new CommissionService(prisma as never);

  it('rides 15% — ceil to platform, residual to driver', () => {
    // 10000 * 15% = 1500 exact
    expect(service.splitGross(10_000, 15)).toEqual({
      grossCdf: 10_000,
      platformFeeCdf: 1_500,
      driverNetCdf: 8_500,
      platformPercent: 15,
      driverPercent: 85,
    });
  });

  it('ceil avoids losing platform cents on awkward fares', () => {
    // 2300 * 15% = 345 exact; 2333 * 15% = 349.95 → ceil 350
    expect(service.splitGross(2_333, 15)).toEqual({
      grossCdf: 2_333,
      platformFeeCdf: 350,
      driverNetCdf: 1_983,
      platformPercent: 15,
      driverPercent: 85,
    });
  });

  it('food 12% and delivery 20% defaults via splitForService', async () => {
    const food = await service.splitForService(25_000, CommissionServiceType.FOOD);
    expect(food.platformFeeCdf).toBe(3_000);
    expect(food.driverNetCdf).toBe(22_000);

    const delivery = await service.splitForService(10_000, CommissionServiceType.DELIVERY);
    expect(delivery.platformFeeCdf).toBe(2_000);
    expect(delivery.driverNetCdf).toBe(8_000);
  });

  it('rental 12% partner share', async () => {
    const rental = await service.splitForService(50_000, CommissionServiceType.RENTAL);
    expect(rental.platformFeeCdf).toBe(6_000);
    expect(rental.driverNetCdf).toBe(44_000);
  });

  it('zero / tiny gross never goes negative', () => {
    expect(service.splitGross(0, 15)).toMatchObject({ platformFeeCdf: 0, driverNetCdf: 0 });
    expect(service.splitGross(1, 15)).toMatchObject({ platformFeeCdf: 1, driverNetCdf: 0 });
  });
});
