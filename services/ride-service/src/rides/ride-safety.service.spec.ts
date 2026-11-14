import { lowRating, routeVerdict } from './ride-safety.service';
import { cleanCriteria } from '../ratings/ratings.service';

describe('ride safety and quality', () => {
  const now = new Date('2026-11-14T10:30:00Z');
  const base = {
    startedAt: new Date('2026-11-14T10:00:00Z'),
    now,
    pickup: { lat: -4.30, lng: 15.30 },
    dropoff: { lat: -4.35, lng: 15.35 },
    stopMinutes: 10,
    detourKm: 3,
  };
  const at = (min: number) => new Date(now.getTime() - min * 60_000);

  it('long stop far from the drop-off', () => {
    const points = [8, 6, 4, 2, 0].map((m) => ({ lat: -4.32, lng: 15.32, at: at(m) }));
    expect(routeVerdict({ ...base, points })).toEqual(['STOP']);
  });

  it('moving normally: nothing', () => {
    const points = [8, 6, 4, 2, 0].map((m, i) => ({ lat: -4.31 - i * 0.008, lng: 15.31 + i * 0.008, at: at(m) }));
    expect(routeVerdict({ ...base, points })).toEqual([]);
  });

  it('big detour', () => {
    const points = [{ lat: -4.20, lng: 15.20, at: at(0) }];
    expect(routeVerdict({ ...base, points })).toContain('DETOUR');
  });

  it('low average on the last N marks only', () => {
    expect(lowRating([2, 3, 3], 5, 3.5)).toBeNull();
    expect(lowRating([2, 3, 3, 3, 2, 5, 5], 5, 3.5)).toBe(2.6);
    expect(lowRating([5, 4, 4, 5, 4], 5, 3.5)).toBeNull();
  });

  it('keeps only valid detailed marks', () => {
    expect(cleanCriteria({ proprete: 5, conduite: 9, autre: 3, ponctualite: '4' })).toEqual({ proprete: 5, ponctualite: 4 });
    expect(cleanCriteria(null)).toBeNull();
  });
});
