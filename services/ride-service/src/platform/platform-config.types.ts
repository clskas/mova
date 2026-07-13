import { MARKET_RDC } from '@mova/shared';

export type PlatformConfigOverrides = {
  interCity?: Partial<typeof MARKET_RDC.interCity>;
  delivery?: Partial<typeof MARKET_RDC.delivery> & { maxFoodInterCityDistanceKm?: number };
  matching?: Partial<typeof MARKET_RDC.matching> & {
    scoreWeights?: Partial<typeof MARKET_RDC.matching.scoreWeights>;
  };
  scheduled?: Partial<typeof MARKET_RDC.scheduled> & { maxScheduleDays?: number };
  trip?: {
    roadDistanceFactor?: number;
    averageSpeedKmh?: Partial<typeof MARKET_RDC.trip.averageSpeedKmh>;
  };
  pricing?: Partial<typeof MARKET_RDC.pricing>;
  carpool?: { matchRadiusKm?: number; relaxedRadiusMultiplier?: number };
};

export type MergedPlatformConfig = {
  interCity: { baseSurchargeCdf: number; perKmSurchargeCdf: number };
  delivery: typeof MARKET_RDC.delivery & { maxFoodInterCityDistanceKm: number };
  matching: {
    initialRadiusKm: number;
    radiusIncrementKm: number;
    radiusIncrementIntervalSec: number;
    maxRadiusKm: number;
    acceptTimeoutSec: number;
    scoreWeights: {
      proximity: number;
      rating: number;
      acceptanceRate: number;
      seniority: number;
    };
  };
  scheduled: {
    autoAssignHoursBefore: number;
    lateCancelHoursBefore: number;
    lateCancelFeePct: number;
    maxScheduleDays: number;
  };
  trip: {
    roadDistanceFactor: number;
    averageSpeedKmh: {
      ride: number;
      delivery: number;
      moving: number;
      errand: number;
      carpool: number;
    };
  };
  pricing: {
    defaultPeakMultiplier: number;
    defaultNightMultiplier: number;
    combinedPeakNightMultiplier: number;
  };
  carpool: { matchRadiusKm: number; relaxedRadiusMultiplier: number };
};

export const PLATFORM_CONFIG_DEFAULTS: MergedPlatformConfig = {
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
