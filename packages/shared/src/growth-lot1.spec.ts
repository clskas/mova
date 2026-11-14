import { clampProposedFare, favoriteDriversFirst, loyaltyPointsFor, normalizeAutomations } from './automations';

describe('growth lot 1', () => {
  it('proposed price stays between the admin bounds', () => {
    const cfg = { minPct: 80, maxPct: 150 };
    expect(clampProposedFare(10000, 5000, cfg)).toBe(8000);
    expect(clampProposedFare(10000, 9000, cfg)).toBe(9000);
    expect(clampProposedFare(10000, 50000, cfg)).toBe(15000);
    expect(clampProposedFare(10000, 9050, cfg)).toBe(9100);
  });

  it('loyalty points per 1 000 FC paid', () => {
    expect(loyaltyPointsFor(4500, 1)).toBe(4);
    expect(loyaltyPointsFor(999, 1)).toBe(0);
    expect(loyaltyPointsFor(10000, 2)).toBe(20);
  });

  it('favourite drivers first, then everyone', () => {
    const d = [{ userId: 'a' }, { userId: 'b' }];
    expect(favoriteDriversFirst(d, new Set(['b']), 0, 1)).toEqual([{ userId: 'b' }]);
    expect(favoriteDriversFirst(d, new Set(['b']), 1, 1)).toEqual(d);
    expect(favoriteDriversFirst(d, new Set(['z']), 0, 1)).toEqual(d);
  });

  it('new switches are off by default and bounded', () => {
    const a = normalizeAutomations({ priceOffer: { enabled: true, minPct: 10, maxPct: 50 }, tips: { presetsCdf: [0, 700] } });
    expect(a.priceOffer).toEqual({ enabled: true, minPct: 50, maxPct: 100 });
    expect(a.tips.presetsCdf).toEqual([700]);
    expect(normalizeAutomations({}).loyalty.enabled).toBe(false);
    expect(normalizeAutomations({}).womenPreference.enabled).toBe(false);
  });
});
