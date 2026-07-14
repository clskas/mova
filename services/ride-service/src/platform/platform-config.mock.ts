import { MARKET_RDC } from '@mova/shared';
import type { PlatformConfigService } from '../platform/platform-config.service';
import type { MergedPlatformConfig } from '../platform/platform-config.types';

/** Defaults alignés sur MARKET_RDC — mocks unitaires. */
export function mockPlatformConfig(
  overrides: Partial<MergedPlatformConfig> = {},
): PlatformConfigService {
  const base: MergedPlatformConfig = {
    interCity: { ...MARKET_RDC.interCity },
    delivery: { ...MARKET_RDC.delivery, maxFoodInterCityDistanceKm: 200 },
    matching: {
      ...MARKET_RDC.matching,
      scoreWeights: { ...MARKET_RDC.matching.scoreWeights },
    },
    scheduled: { ...MARKET_RDC.scheduled, maxScheduleDays: 7 },
    trip: {
      roadDistanceFactor: MARKET_RDC.trip.roadDistanceFactor,
      averageSpeedKmh: { ...MARKET_RDC.trip.averageSpeedKmh },
    },
    pricing: { ...MARKET_RDC.pricing },
    carpool: { matchRadiusKm: 5, relaxedRadiusMultiplier: 3 },
  };
  return {
    get: () => ({ ...base, ...overrides }),
    getOverrides: () => ({}),
    getDefaults: () => base,
    interCitySurchargeCdf: (km: number) =>
      Math.round(base.interCity.baseSurchargeCdf + km * base.interCity.perKmSurchargeCdf),
    refresh: jest.fn(),
    update: jest.fn(),
  } as unknown as PlatformConfigService;
}
