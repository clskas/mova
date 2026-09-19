import { MARKET_RDC, normalizeDocumentTypeList } from '@mova/shared';

export type DriverOpsConfig = {
  /** When true, missing required docs block ride/delivery offers after grace period. */
  requireDocumentsForJobs: boolean;
  /** Days after account creation before blocking (0 = immediate). */
  documentsGracePeriodDays: number;
  requiredDriverDocuments: string[];
  requiredRestaurantDocuments: string[];
  requiredRentalCompanyDocuments: string[];
  requiredRentalIndividualDocuments: string[];
};

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
  driverOps?: Partial<DriverOpsConfig>;
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
  driverOps: DriverOpsConfig;
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
  driverOps: {
    requireDocumentsForJobs: false,
    documentsGracePeriodDays: 7,
    requiredDriverDocuments: [],
    requiredRestaurantDocuments: [],
    requiredRentalCompanyDocuments: [],
    requiredRentalIndividualDocuments: [],
  },
};

export function mergeDriverOps(
  base: DriverOpsConfig,
  patch?: Partial<DriverOpsConfig>,
): DriverOpsConfig {
  if (!patch) return base;
  return {
    requireDocumentsForJobs:
      patch.requireDocumentsForJobs !== undefined
        ? patch.requireDocumentsForJobs === true
        : base.requireDocumentsForJobs,
    documentsGracePeriodDays:
      patch.documentsGracePeriodDays !== undefined
        ? Math.max(0, Math.floor(Number(patch.documentsGracePeriodDays) || 0))
        : base.documentsGracePeriodDays,
    requiredDriverDocuments:
      patch.requiredDriverDocuments !== undefined
        ? normalizeDocumentTypeList(patch.requiredDriverDocuments)
        : base.requiredDriverDocuments,
    requiredRestaurantDocuments:
      patch.requiredRestaurantDocuments !== undefined
        ? normalizeDocumentTypeList(patch.requiredRestaurantDocuments)
        : base.requiredRestaurantDocuments,
    requiredRentalCompanyDocuments:
      patch.requiredRentalCompanyDocuments !== undefined
        ? normalizeDocumentTypeList(patch.requiredRentalCompanyDocuments)
        : base.requiredRentalCompanyDocuments,
    requiredRentalIndividualDocuments:
      patch.requiredRentalIndividualDocuments !== undefined
        ? normalizeDocumentTypeList(patch.requiredRentalIndividualDocuments)
        : base.requiredRentalIndividualDocuments,
  };
}
