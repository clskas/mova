import { compactForAi } from './ai-insights.service';

describe('compactForAi', () => {
  it('drops private keys and keeps the numbers', () => {
    const json = compactForAi({
      totals: { rides: 120, revenueCdf: 3_500_000 },
      topDrivers: [{ name: 'Jean', rides: 14, phone: '+243900000000', email: 'a@b.cd', lat: -4.3 }],
      pickupAddress: 'Avenue X',
    });
    const parsed = JSON.parse(json);
    expect(parsed.totals).toEqual({ rides: 120, revenueCdf: 3_500_000 });
    expect(parsed.topDrivers[0]).toEqual({ name: 'Jean', rides: 14 });
    expect(json).not.toContain('+243');
    expect(json).not.toContain('Avenue X');
  });

  it('caps arrays and total size', () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ day: i, count: i * 2 })) };
    expect(JSON.parse(compactForAi(big)).rows).toHaveLength(40);
    expect(compactForAi({ s: 'x'.repeat(100_000) }, 1000).length).toBeLessThan(1100);
  });
});
