import { MARKET_RDC, normalizeDocumentTypeList } from '@mova/shared';

export type DriverOpsConfig = {
  /** When true, missing required docs block ride/delivery offers after grace period. */
  requireDocumentsForJobs: boolean;
  /** Days before blocking after grace start (0 = immediate). */
  documentsGracePeriodDays: number;
  /** ISO timestamp when document requirements were last activated/changed. */
  documentsGraceAnchorAt: string | null;
  requiredDriverDocuments: string[];
  requiredRestaurantDocuments: string[];
  requiredRentalCompanyDocuments: string[];
  requiredRentalIndividualDocuments: string[];
};

/** Identity checks offered to drivers in the app. */
export type IdentityVerificationConfig = {
  /** Shows the Smile ID verification card (document + live selfie) in the driver app. */
  smileIdInApp: boolean;
};

/** Timeout / garde-fous paiements espèces (courses & livraisons). */
export type CashPaymentConfig = {
  /** Auto-clôturer les PENDING sans litige après ce délai. */
  autoConfirmEnabled: boolean;
  /** Délai en heures (1–168). */
  autoConfirmHours: number;
  /** Plafond CDF : au-delà, pas d’auto-confirm. */
  autoConfirmMaxCdf: number;
};

/** Relances d'une course terminée et non réglée (réglables par le super-admin). */
export type UnpaidFollowupConfig = {
  enabled: boolean;
  /** 1er rappel au passager (minutes après la fin). */
  reminder1Min: number;
  /** Question au chauffeur « le client a-t-il payé ? » (minutes). */
  driverCheckMin: number;
  /** 2e rappel au passager, avec SMS (minutes). */
  reminder2Min: number;
  /** Litige automatique « non payé » (heures). */
  autoDisputeEnabled: boolean;
  autoDisputeHours: number;
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
  carpool?: {
    matchRadiusKm?: number;
    relaxedRadiusMultiplier?: number;
    /** Uber Pool fare vs exclusive (0.65 = −35 %). */
    fareMultiplier?: number;
    maxPassengers?: number;
    maxDetourKm?: number;
  };
  driverOps?: Partial<DriverOpsConfig>;
  cashPayment?: Partial<CashPaymentConfig>;
  unpaidFollowup?: Partial<UnpaidFollowupConfig>;
  identityVerification?: Partial<IdentityVerificationConfig>;
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
  carpool: {
    matchRadiusKm: number;
    relaxedRadiusMultiplier: number;
    fareMultiplier: number;
    maxPassengers: number;
    maxDetourKm: number;
  };
  driverOps: DriverOpsConfig;
  cashPayment: CashPaymentConfig;
  unpaidFollowup: UnpaidFollowupConfig;
  identityVerification: IdentityVerificationConfig;
};

export const UNPAID_FOLLOWUP_DEFAULTS: UnpaidFollowupConfig = {
  enabled: true,
  reminder1Min: 5,
  driverCheckMin: 30,
  reminder2Min: 120,
  autoDisputeEnabled: true,
  autoDisputeHours: 24,
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
  carpool: {
    matchRadiusKm: 5,
    relaxedRadiusMultiplier: 3,
    fareMultiplier: 0.65,
    maxPassengers: 3,
    maxDetourKm: 2.5,
  },
  driverOps: {
    requireDocumentsForJobs: false,
    documentsGracePeriodDays: 7,
    documentsGraceAnchorAt: null,
    requiredDriverDocuments: [],
    requiredRestaurantDocuments: [],
    requiredRentalCompanyDocuments: [],
    requiredRentalIndividualDocuments: [],
  },
  cashPayment: {
    autoConfirmEnabled: true,
    autoConfirmHours: 24,
    autoConfirmMaxCdf: 150_000,
  },
  unpaidFollowup: { ...UNPAID_FOLLOWUP_DEFAULTS },
  identityVerification: { smileIdInApp: false },
};

export function mergeIdentityVerification(
  base: IdentityVerificationConfig,
  patch?: Partial<IdentityVerificationConfig>,
): IdentityVerificationConfig {
  if (!patch) return base;
  return {
    smileIdInApp: patch.smileIdInApp !== undefined ? patch.smileIdInApp === true : base.smileIdInApp,
  };
}

function intIn(v: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function mergeUnpaidFollowup(
  base: UnpaidFollowupConfig,
  patch?: Partial<UnpaidFollowupConfig>,
): UnpaidFollowupConfig {
  if (!patch) return base;
  return {
    enabled: patch.enabled !== undefined ? patch.enabled === true : base.enabled,
    reminder1Min: patch.reminder1Min !== undefined ? intIn(patch.reminder1Min, base.reminder1Min, 1, 1440) : base.reminder1Min,
    driverCheckMin:
      patch.driverCheckMin !== undefined ? intIn(patch.driverCheckMin, base.driverCheckMin, 1, 1440) : base.driverCheckMin,
    reminder2Min: patch.reminder2Min !== undefined ? intIn(patch.reminder2Min, base.reminder2Min, 1, 1440) : base.reminder2Min,
    autoDisputeEnabled:
      patch.autoDisputeEnabled !== undefined ? patch.autoDisputeEnabled === true : base.autoDisputeEnabled,
    autoDisputeHours:
      patch.autoDisputeHours !== undefined ? intIn(patch.autoDisputeHours, base.autoDisputeHours, 1, 168) : base.autoDisputeHours,
  };
}

export function mergeCashPayment(
  base: CashPaymentConfig,
  patch?: Partial<CashPaymentConfig>,
): CashPaymentConfig {
  if (!patch) return base;
  return {
    autoConfirmEnabled:
      patch.autoConfirmEnabled !== undefined
        ? patch.autoConfirmEnabled === true
        : base.autoConfirmEnabled,
    autoConfirmHours:
      patch.autoConfirmHours !== undefined
        ? Math.max(1, Math.min(168, Math.floor(Number(patch.autoConfirmHours) || base.autoConfirmHours)))
        : base.autoConfirmHours,
    autoConfirmMaxCdf:
      patch.autoConfirmMaxCdf !== undefined
        ? Math.max(0, Math.floor(Number(patch.autoConfirmMaxCdf) || 0))
        : base.autoConfirmMaxCdf,
  };
}

function sortedDocKey(list: string[]): string {
  return [...list].map((s) => s.toUpperCase()).sort().join('|');
}

export function mergeDriverOps(
  base: DriverOpsConfig,
  patch?: Partial<DriverOpsConfig>,
): DriverOpsConfig {
  if (!patch) return base;
  const next: DriverOpsConfig = {
    requireDocumentsForJobs:
      patch.requireDocumentsForJobs !== undefined
        ? patch.requireDocumentsForJobs === true
        : base.requireDocumentsForJobs,
    documentsGracePeriodDays:
      patch.documentsGracePeriodDays !== undefined
        ? Math.max(0, Math.floor(Number(patch.documentsGracePeriodDays) || 0))
        : base.documentsGracePeriodDays,
    documentsGraceAnchorAt:
      patch.documentsGraceAnchorAt !== undefined
        ? patch.documentsGraceAnchorAt
        : (base.documentsGraceAnchorAt ?? null),
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

  const requirementsChanged =
    next.requireDocumentsForJobs !== base.requireDocumentsForJobs ||
    sortedDocKey(next.requiredDriverDocuments) !== sortedDocKey(base.requiredDriverDocuments) ||
    sortedDocKey(next.requiredRestaurantDocuments) !==
      sortedDocKey(base.requiredRestaurantDocuments) ||
    sortedDocKey(next.requiredRentalCompanyDocuments) !==
      sortedDocKey(base.requiredRentalCompanyDocuments) ||
    sortedDocKey(next.requiredRentalIndividualDocuments) !==
      sortedDocKey(base.requiredRentalIndividualDocuments);

  if (!next.requireDocumentsForJobs) {
    next.documentsGraceAnchorAt = null;
  } else if (patch.documentsGraceAnchorAt === undefined) {
    if (requirementsChanged || !next.documentsGraceAnchorAt) {
      // Nouvelle exigence (ou ancre absente) : le délai admin repart maintenant.
      next.documentsGraceAnchorAt = new Date().toISOString();
    }
  }

  return next;
}
