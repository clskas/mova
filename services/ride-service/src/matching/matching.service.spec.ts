import { MARKET_RDC } from '@mova/shared';
import { MatchingService } from './matching.service';
import { computeDriverEta, etaMinutesFromDistanceKm, haversineKm } from './eta.util';

describe('MatchingService', () => {
  const service = new MatchingService();

  it('increments search radius per attempt up to max', () => {
    expect(service.computeRadiusKm(0)).toBe(MARKET_RDC.matching.initialRadiusKm);
    expect(service.computeRadiusKm(1)).toBe(
      MARKET_RDC.matching.initialRadiusKm + MARKET_RDC.matching.radiusIncrementKm,
    );
    expect(service.computeRadiusKm(8)).toBe(MARKET_RDC.matching.maxRadiusKm);
    expect(service.computeRadiusKm(100)).toBe(MARKET_RDC.matching.maxRadiusKm);
  });

  it('returns matching meta with next radius', () => {
    const meta = service.getMatchingMeta(2);
    expect(meta.radiusKm).toBe(4);
    expect(meta.nextRadiusKm).toBe(5);
    expect(meta.incrementIntervalSec).toBe(MARKET_RDC.matching.radiusIncrementIntervalSec);
    expect(meta.maxRadiusKm).toBe(MARKET_RDC.matching.maxRadiusKm);
  });
});

describe('eta.util', () => {
  it('computes haversine distance in km', () => {
    const km = haversineKm(-4.32, 15.31, -4.33, 15.32);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(5);
  });

  it('estimates ETA at 25 km/h urban speed', () => {
    expect(etaMinutesFromDistanceKm(2.5)).toBe(6);
    expect(etaMinutesFromDistanceKm(0.1)).toBe(1);
  });

  it('computes driver ETA to pickup', () => {
    const { driverDistanceKm, etaMinutes } = computeDriverEta(-4.32, 15.31, -4.33, 15.32);
    expect(driverDistanceKm).toBeGreaterThan(0);
    expect(etaMinutes).toBeGreaterThanOrEqual(1);
    expect(etaMinutes).toBe(etaMinutesFromDistanceKm(driverDistanceKm));
  });
});
