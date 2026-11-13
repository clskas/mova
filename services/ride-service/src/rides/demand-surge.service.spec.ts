import { demandLevel } from './demand-surge.service';
import { PricingService } from './pricing.service';

describe('demand surge level', () => {
  it('needs enough requests, then compares to free drivers', () => {
    expect(demandLevel(2, 0, 3)).toBe(0);
    expect(demandLevel(3, 5, 3)).toBe(0);
    expect(demandLevel(3, 3, 3)).toBe(1);
    expect(demandLevel(6, 3, 3)).toBe(2);
    expect(demandLevel(4, 0, 3)).toBe(2);
  });
});

describe('waiting fee', () => {
  const rule = { perMinuteCdf: 60 };
  const prisma = { pricingRule: { findUnique: jest.fn().mockResolvedValue(rule), findFirst: jest.fn() } };
  const cfg = (over: Record<string, unknown> = {}) => ({
    get: () => ({ pricing: { waitFeeEnabled: true, waitFreeMinutes: 5, waitMaxChargedMinutes: 20, ...over } }),
  });
  const at = (min: number) => new Date(Date.UTC(2026, 10, 13, 10, min));

  it('free first minutes, then the price per minute, up to the ceiling', async () => {
    const svc = new PricingService(prisma as never, {} as never, cfg() as never);
    expect((await svc.waitFee('STANDARD' as never, 'Kinshasa', at(0), at(4))).feeCdf).toBe(0);
    expect((await svc.waitFee('STANDARD' as never, 'Kinshasa', at(0), at(8))).feeCdf).toBe(180);
    expect((await svc.waitFee('STANDARD' as never, 'Kinshasa', at(0), at(59))).feeCdf).toBe(20 * 60);
  });

  it('nothing when switched off', async () => {
    const svc = new PricingService(prisma as never, {} as never, cfg({ waitFeeEnabled: false }) as never);
    expect((await svc.waitFee('STANDARD' as never, 'Kinshasa', at(0), at(30))).feeCdf).toBe(0);
  });
});
