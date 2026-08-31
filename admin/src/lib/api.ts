/** Passerelle API unique (microservices). Toutes les routes passent par `/api/...`. */
import { authHeaders, getToken, roleFromToken } from "./auth";
import type { AdminRole } from "./rbac";
import { isAdminRole, normalizeAdminRole } from "./rbac";

/** Origin only — strip accidental trailing `/api` (mobile-style PROD_API_URL). */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");
/** Mock API fallback only when explicitly enabled (dev demos without backend). */
const USE_API_MOCK = process.env.NEXT_PUBLIC_USE_API_MOCK === "true";

export type AdminMetrics = {
  users?: number;
  drivers?: number;
  availableDrivers?: number;
  pendingKyc?: number;
  approvedDrivers?: number;
  rides?: number;
  completedRides?: number;
  revenueCdf?: number;
  openIncidents?: number;
  sosIncidents?: number;
  activeRides?: number;
  activeDeliveries?: number;
  cancelledRides?: number;
  scheduledRides?: number;
  carpoolTrips?: number;
  movingRequests?: number;
  rentalInquiries?: number;
  walletBalanceCdf?: number;
  walletCount?: number;
  walletTransactionsToday?: number;
  city?: string;
  totalUsers?: number;
  activeDrivers?: number;
  ridesToday?: number;
  revenueTodayCdf?: number;
  todayRides?: number;
  todayCompleted?: number;
};

export type AdminReports = {
  periodDays: number;
  generatedAt: string;
  daily: { date: string; rides: number; completed: number; revenueCdf: number; cancelled: number; deliveries: number }[];
  vehicleBreakdown: Record<string, number>;
  serviceBreakdown: {
    rides: number;
    deliveries: number;
    errands: number;
    food: number;
    parcel: number;
    express: number;
    moving: number;
    scheduled: number;
    carpool: number;
  };
  kpis: {
    totalRides: number;
    completedRides: number;
    cancelledRides: number;
    completionRate: number;
    cancelRate: number;
    totalRevenueCdf: number;
    deliveryRevenueCdf: number;
    avgTicketCdf: number;
    totalDeliveries: number;
  };
};

export type AdminUser = {
  id: string;
  phone?: string;
  role?: string;
  status?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  createdAt?: string;
};

export type AdminDriver = {
  id: string;
  userId: string;
  publicId?: string;
  firstName?: string | null;
  lastName?: string | null;
  licenseNumber?: string | null;
  isAvailable?: boolean;
  ratingAvg?: number;
  totalRides?: number;
  kycStatus?: string;
  onboardingCompleted?: boolean;
  activationPinVerified?: boolean;
  kycDocumentsUploaded?: number;
  kycDocumentsRequired?: number;
  kycDocumentsComplete?: boolean;
  vehicleTypeApprovalStatus?: string;
  readyForReview?: boolean;
  currentLat?: number | null;
  currentLng?: number | null;
  documentsCanOperate?: boolean;
  documentsRenewalPending?: boolean;
  documentsStatus?: {
    canOperate?: boolean;
    blockReason?: string;
    expiringSoon?: string[];
    expired?: string[];
    items?: { field: string; label: string; daysRemaining: number | null; status: string }[];
  };
  vehicles?: {
    id: string;
    type: string;
    plateNumber: string;
    make?: string;
    model?: string;
    imageUrl?: string | null;
    isActive?: boolean;
    typeApprovalStatus?: string;
    typeApprovalNotes?: string | null;
    typeApprovedAt?: string | null;
  }[];
  createdAt?: string;
};

export type AdminDriverDetail = AdminDriver & {
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string;
    phoneMasked?: string;
  } | null;
  idDocumentNumber?: string | null;
  licenseExpiry?: string | null;
  insuranceExpiry?: string | null;
  technicalInspectionExpiry?: string | null;
  documentsRenewalPending?: boolean;
  documentsRenewalRequestedAt?: string | null;
  payoutProvider?: string | null;
  payoutPhone?: string | null;
  charterAcceptedAt?: string | null;
  trainingCompletedAt?: string | null;
  activationPin?: string;
  canGenerateActivationPin?: boolean;
  activationPinVerifiedAt?: string | null;
  readyForReview?: boolean;
  kycDocumentsUploaded?: number;
  kycDocumentsRequired?: number;
  kycDocumentsComplete?: boolean;
  vehicleTypeApprovalPending?: boolean;
  vehicleTypeApprovalStatus?: string;
  vehicle?: {
    id?: string;
    type?: string;
    typeApprovalStatus?: string;
    typeApprovalNotes?: string | null;
    typeApprovedAt?: string | null;
    imageUrl?: string | null;
    plateNumber?: string;
    make?: string;
    model?: string;
  } | null;
  kyc?: {
    checklist?: {
      type: string;
      label: string;
      required: boolean;
      uploaded: boolean;
      status?: string | null;
      url?: string | null;
      ocr?: {
        documentId?: string;
        status?: string;
        extractedExpiry?: string | null;
        profileExpiry?: string | null;
        confidence?: number | null;
        notes?: string | null;
        checkedAt?: string | null;
      } | null;
    }[];
    requiredComplete?: boolean;
  };
};

export type KycItem = {
  id: string;
  userId?: string;
  type?: string;
  status?: string;
  url?: string;
  notes?: string;
  createdAt?: string;
};

export type Incident = {
  id: string;
  userId?: string;
  rideId?: string | null;
  type?: string;
  description?: string;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  isEmergency?: boolean;
  createdAt?: string;
};

export type FraudSeverity = "LOW" | "MEDIUM" | "HIGH";

export type FraudAlert = {
  entityId: string;
  entityType: "DRIVER" | "PASSENGER";
  score: number;
  severity: FraudSeverity;
  cancellationsAfterAccept: number;
  unpaidCompleted: number;
  recurringPairs: number;
  counterpartIds: string[];
  reasons: string[];
  sampleRideIds: string[];
  incidentCreated: boolean;
};

export type FraudAlertsResponse = {
  periodDays: number;
  generatedAt: string;
  autoIncidentThreshold: number;
  summary: {
    totalAlerts: number;
    highSeverity: number;
    cancellationsAfterAccept: number;
    unpaidCompleted: number;
    recurringPairs: number;
    incidentsCreated: number;
  };
  alerts: FraudAlert[];
};

export type FraudIncidentResult = {
  created: boolean;
  alreadyExists: boolean;
  incidentId?: string;
  message: string;
};

export type DeliveryOverview = {
  id: string;
  type?: string;
  status?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  restaurantName?: string;
  description?: string;
  weightCategory?: string;
  priceCdf?: number;
  createdAt?: string;
  userId?: string;
  driverId?: string | null;
  passengerName?: string;
  driverName?: string;
  passengerPhone?: string;
  driverPhone?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  gpsTrace?: GpsPoint[];
  events?: { event: string; createdAt: string }[];
  timeline?: { label: string; done: boolean; at?: string }[];
};

export type ScheduledOverview = {
  id: string;
  passengerId?: string;
  passengerName?: string;
  passengerPhone?: string;
  driverId?: string | null;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  scheduledAt?: string;
  status?: string;
  priceCdf?: number;
};

export type RideOverview = {
  id: string;
  passengerId?: string;
  driverId?: string | null;
  status?: string;
  vehicleType?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  priceCdf?: number;
  createdAt?: string;
  gpsTrace?: GpsPoint[];
};

export type GpsPoint = { lat: number; lng: number; recordedAt?: string };

export type GpsTraceResponse = {
  referenceType?: string;
  referenceId?: string;
  pointCount?: number;
  points?: GpsPoint[];
  lastPoint?: GpsPoint | null;
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine?: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  imageUrl?: string | null;
  menuItems?: unknown;
  isActive?: boolean;
  isAcceptingOrders?: boolean;
  prepTimeMin?: number;
  ownerUserId?: string | null;
};

export type PubliciteCible = "TOUS" | "PASSENGER" | "DRIVER" | "RESTAURANT" | "RENTAL_PARTNER";

export type Publicite = {
  id: string;
  titre: string;
  imageUrl: string;
  lien?: string | null;
  description?: string | null;
  cible: PubliciteCible;
  isActive: boolean;
  dateDebut: string;
  dateFin?: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PricingRule = {
  id?: string;
  vehicleType: string;
  city?: string;
  baseFareCdf: number;
  perKmCdf: number;
  perMinuteCdf: number;
  minFareCdf: number;
  peakMultiplier?: number;
  nightMultiplier?: number;
  isActive?: boolean;
};

export type DeliveryPricingRule = {
  category: string;
  baseFeeCdf: number;
  multiplier: number;
  perUnitCdf?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type ErrandCategoryEstimate = {
  category: string;
  label: string;
  perItemCdf: number;
  keywordPattern?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type PricingTimeWindow = {
  id: string;
  city: string;
  kind: "PEAK" | "NIGHT";
  startHour: number;
  endHour: number;
  label?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type PricingTimeWindowsList = {
  timezone: string;
  windows: PricingTimeWindow[];
};

export type ServiceSurcharge = {
  id: string;
  type: string;
  baseFeeCdf: number;
  multiplier: number;
  perUnitCdf?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type MovingVehicleCategoryPricing = {
  id: string;
  category: string;
  label: string;
  multiplier: number;
  sortOrder?: number;
  isActive?: boolean;
};

export type CancellationPolicy = {
  id: string;
  vehicleType: string;
  freeCancelMinutes: number;
  passengerFeeCdf: number;
  driverCompensationCdf: number;
  noShowFeeCdf: number;
};

export type ParcelWeightBand = {
  id: string;
  category: string;
  label: string;
  maxKg: number;
  multiplier: number;
  sortOrder?: number;
  isActive?: boolean;
};

export type PlatformConfigData = {
  interCity: { baseSurchargeCdf: number; perKmSurchargeCdf: number };
  delivery: {
    maxFoodDeliveryDistanceKm: number;
    maxFoodDeliveryFeeCdf: number;
    restaurantListRadiusKm: number;
    maxFoodInterCityDistanceKm: number;
  };
  matching: {
    initialRadiusKm: number;
    radiusIncrementKm: number;
    radiusIncrementIntervalSec: number;
    maxRadiusKm: number;
    acceptTimeoutSec: number;
    scoreWeights: { proximity: number; rating: number; acceptanceRate: number; seniority: number };
  };
  scheduled: {
    autoAssignHoursBefore: number;
    lateCancelHoursBefore: number;
    lateCancelFeePct: number;
    maxScheduleDays: number;
  };
  trip: {
    roadDistanceFactor: number;
    averageSpeedKmh: { ride: number; delivery: number; moving: number; errand: number; carpool: number };
  };
  pricing: {
    defaultPeakMultiplier: number;
    defaultNightMultiplier: number;
    combinedPeakNightMultiplier: number;
  };
  carpool: { matchRadiusKm: number; relaxedRadiusMultiplier: number };
};

export type PlatformConfigResponse = {
  config: PlatformConfigData;
  overrides?: Record<string, unknown>;
  defaults?: PlatformConfigData;
};

export type PlatformCommission = {
  id: string;
  serviceType: string;
  platformPercent: number;
  driverPercent: number;
  fixedFeeCdf?: number | null;
  perItemFeeCdf?: number | null;
  description?: string | null;
  isActive?: boolean;
};

export type PromoCode = {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountCdf?: number | null;
  maxUses?: number | null;
  usedCount?: number;
  validUntil?: string | null;
  isActive?: boolean;
};

/** Villes SENGA couvertes (aligné DRC_SERVICE_AREAS / seed ride-service). */
export const MOVA_CITIES = [
  "Kinshasa",
  "Lubumbashi",
  "Goma",
  "Bukavu",
  "Kisangani",
  "Mbuji-Mayi",
  "Kananga",
  "Matadi",
  "Boma",
  "Kolwezi",
  "Likasi",
  "Tshikapa",
  "Mbandaka",
  "Kindu",
  "Bunia",
  "Butembo",
  "Beni",
  "Uvira",
  "Kalemie",
  "Kamina",
  "Gbadolite",
  "Gemena",
  "Boende",
  "Lisala",
  "Isiro",
  "Buta",
  "Inongo",
  "Bandundu",
  "Kikwit",
  "Kenge",
  "Kabinda",
  "Lusambo",
] as const;

export type SubscriptionPlan = {
  id: string;
  name: string;
  priceCdfPerMonth: number;
  benefits: string[];
  isActive: boolean;
  subscriberCount?: number;
  feeReductionPercent?: number;
  priorityMatching?: boolean;
};

export type SubscriptionRecord = {
  id: string;
  userId: string;
  planId: string;
  planName?: string;
  status: string;
  startedAt?: string;
  expiresAt?: string;
};

export type AdminSessionUser = {
  id: string;
  phone?: string;
  phoneMasked?: string;
  role: AdminRole | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailMasked?: string;
  googleLinked?: boolean;
  hasPhone?: boolean;
  canUnlinkGoogle?: boolean;
  canUnlinkPhone?: boolean;
  pinConfigured?: boolean;
};

export type WalletOverview = {
  totalBalanceCdf?: number;
  /** Solde du compte trésorerie SENGA (commissions virtuelles). */
  platformBalanceCdf?: number;
  /** Somme des soldes utilisateurs (passagers, chauffeurs, partenaires). */
  userLiabilitiesCdf?: number;
  pendingPayoutsCdf?: number;
  transactionsToday?: number;
  walletCount?: number;
};

export type CashDebtor = {
  driverUserId: string;
  driverName?: string | null;
  totalCdf: number;
  platformFeeCdf: number;
  restaurantShareCdf: number;
  partnerShareCdf: number;
  openCount: number;
};

export type CashDebtLine = {
  id: string;
  driverUserId: string;
  driverName?: string | null;
  referenceType: string;
  referenceId: string;
  category: string;
  amountCdf: number;
  description?: string | null;
  beneficiaryUserId?: string | null;
  createdAt: string;
};

export type CashDebtsOverview = {
  totalOpenCdf: number;
  openDebtCount: number;
  debtorCount: number;
  platformFeeCdf: number;
  restaurantShareCdf: number;
  partnerShareCdf: number;
  debtors: CashDebtor[];
  debts: CashDebtLine[];
};

export type Commune = {
  id: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
};

export type Province = {
  id: string;
  name: string;
  isActive?: boolean;
  _count?: { cities: number };
};

export type AdminCity = {
  id: string;
  slug: string;
  name: string;
  provinceId: string;
  province?: { id: string; name: string };
  centerLat: number;
  centerLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  isActive: boolean;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const ADMIN_TECHNICAL_PATTERNS = [
  /^HTTP \d/i,
  /\bHTTP\s*\d{3}\b/i,
  /\(\s*\d{3}\s*\)/,
  /^Erreur \d{3}$/,
  /^PDF \d+$/i,
  /API\s*:/i,
  /https?:\/\//i,
  /onrender\.com/i,
  /localhost:\d+/i,
  /NEXT_PUBLIC_[A-Z0-9_]+/,
  /Exception:/i,
  /SocketException/i,
  /TimeoutException/i,
  /FormatException/i,
  /MOVA_[A-Z]+_\d+/,
  /SENGA_[A-Z]+_\d+/,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /fetch failed/i,
  /Failed to fetch/i,
  /NetworkError/i,
  /Network request failed/i,
  /PrismaClient/i,
  /Prisma|prisma\./i,
  /NestJS|InternalServerError/i,
  /Internal server error/i,
  /Forbidden resource/i,
  /^Unauthorized$/i,
  /^Forbidden$/i,
  /^Bad Request$/i,
  /^Not Found$/i,
  /Unexpected token/i,
  /Cannot (GET|POST|PUT|PATCH|DELETE)\b/i,
  /Unique constraint/i,
  /Foreign key constraint/i,
  /TypeError:/i,
  /SyntaxError:/i,
  /AggregateError/i,
  /EACCES|ENOENT|EPERM/i,
  /^\s*at\s+\S+/m,
  /\.(ts|js|tsx|jsx):\d+/i,
];

function adminErrorFallback(status?: number): string {
  if (status === 401) return "Session expirée. Reconnectez-vous.";
  if (status === 403) return "Accès refusé.";
  if (status === 404) return "Élément introuvable.";
  if (status === 429) return "Trop de tentatives. Réessayez dans un instant.";
  if (status === 0) return "Réseau indisponible. Vérifiez votre connexion.";
  if (status === 502 || status === 503) return "Service temporairement indisponible. Réessayez dans quelques minutes.";
  return "Une erreur est survenue. Réessayez.";
}

export function sanitizeAdminError(message: string, status?: number): string {
  const fallback = adminErrorFallback(status);
  const msg = (message ?? "").trim();
  if (!msg) return fallback;
  if (msg.length > 180) return fallback;
  if (ADMIN_TECHNICAL_PATTERNS.some((re) => re.test(msg))) return fallback;
  if (msg.includes("MOVA_") && msg.includes("_")) return fallback;
  return msg;
}

/** Map any thrown value to a safe French UI string. */
export function toUserErrorMessage(
  err: unknown,
  fallback = "Une erreur est survenue. Réessayez.",
): string {
  const status = err instanceof ApiError ? err.status : undefined;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const cleaned = sanitizeAdminError(raw, status);
  const generic = adminErrorFallback(status);
  if (cleaned === generic && fallback && fallback !== generic) return fallback;
  return cleaned || fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const hasToken = Boolean(getToken());
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...init?.headers,
      },
    });
  } catch {
    if (!hasToken && USE_API_MOCK) return mockFor<T>(path, init);
    throw new ApiError(adminErrorFallback(0), 0);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error?.message ?? body.message ?? message;
    } catch {
      /* ignore */
    }
    if (hasToken || !USE_API_MOCK) {
      throw new ApiError(sanitizeAdminError(message, res.status), res.status);
    }
    return mockFor<T>(path, init);
  }
  return (await res.json()) as T;
}

export async function checkGatewayHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function mockFor<T>(path: string, init?: RequestInit): T {
  const method = init?.method?.toUpperCase() ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : {};

  if (path.includes("/metrics")) {
    return {
      users: 1240,
      drivers: 86,
      availableDrivers: 42,
      pendingKyc: 7,
      approvedDrivers: 72,
      rides: 3120,
      completedRides: 2980,
      revenueCdf: 24500000,
      todayRides: 312,
      todayCompleted: 298,
      todayRevenueCdf: 2450000,
      activeRides: 18,
      activeDeliveries: 12,
      cancelledRides: 140,
      openIncidents: 3,
      sosIncidents: 1,
      scheduledRides: 24,
      carpoolTrips: 8,
      movingRequests: 5,
      rentalInquiries: 3,
      walletBalanceCdf: 8900000,
      walletCount: 980,
      walletTransactionsToday: 156,
      city: "RDC",
    } as T;
  }
  if (path.includes("/reports")) {
    const daysMatch = path.match(/days=(\d+)/);
    const days = daysMatch ? Number(daysMatch[1]) : 30;
    const daily = Array.from({ length: Math.min(days, 14) }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (Math.min(days, 14) - 1 - i));
      return {
        date: d.toISOString().slice(0, 10),
        rides: 20 + Math.floor(Math.random() * 30),
        completed: 18 + Math.floor(Math.random() * 25),
        revenueCdf: 150000 + Math.floor(Math.random() * 200000),
        cancelled: Math.floor(Math.random() * 4),
        deliveries: 8 + Math.floor(Math.random() * 12),
      };
    });
    return {
      periodDays: days,
      generatedAt: new Date().toISOString(),
      daily,
      vehicleBreakdown: { MOTO_TAXI: 120, STANDARD: 85, COMFORT: 45, VIP: 12 },
      serviceBreakdown: { rides: 262, deliveries: 98, errands: 34, food: 40, parcel: 35, express: 23, moving: 5, scheduled: 24, carpool: 8 },
      kpis: {
        totalRides: 262,
        completedRides: 240,
        cancelledRides: 22,
        completionRate: 0.916,
        cancelRate: 0.084,
        totalRevenueCdf: 4200000,
        deliveryRevenueCdf: 890000,
        avgTicketCdf: 17500,
        totalDeliveries: 132,
      },
    } as T;
  }
  if (path.match(/\/users\/[^/?]+/) && method === "GET") {
    return {
      id: "1",
      phone: "+243812345678",
      role: "PASSENGER",
      status: "ACTIVE",
      firstName: "Marie",
      lastName: "Kabongo",
    } as T;
  }
  if (path.includes("/users") && method === "PATCH") {
    return { id: "1", ...body } as T;
  }
  if (path.includes("/users")) {
    return [
      { id: "1", phone: "+243812345678", role: "PASSENGER", status: "ACTIVE", firstName: "Marie", lastName: "K." },
      { id: "2", phone: "+243998765432", role: "DRIVER", status: "ACTIVE", firstName: "Jean", lastName: "M." },
      { id: "3", phone: "+243900000001", role: "SUPER_ADMIN", status: "ACTIVE", firstName: "Admin", lastName: "SENGA" },
    ] as T;
  }
  if (path.match(/\/drivers\/[^/?]+/) && method === "GET") {
    return {
      id: "d1",
      userId: "2",
      isAvailable: true,
      kycStatus: "APPROVED",
      ratingAvg: 4.8,
      totalRides: 142,
      vehicles: [{ id: "v1", type: "STANDARD", plateNumber: "KIN-1234", isActive: true }],
    } as T;
  }
  if (path.includes("/drivers") && method === "PATCH") {
    return { userId: "2", isAvailable: body.active } as T;
  }
  if (path.includes("/drivers")) {
    return [
      {
        id: "d1",
        userId: "2",
        isAvailable: true,
        kycStatus: "APPROVED",
        ratingAvg: 4.8,
        totalRides: 142,
        vehicles: [{ id: "v1", type: "STANDARD", plateNumber: "KIN-1234" }],
      },
    ] as T;
  }
  if (path.includes("/kyc/pending")) {
    return [
      {
        id: "kyc-1",
        userId: "2",
        type: "DRIVERS_LICENSE",
        status: "PENDING",
        url: "https://placehold.co/600x400/png?text=Permis",
      },
    ] as T;
  }
  if (path.includes("/kyc/") && method === "POST") {
    return { id: path.split("/").pop(), status: body.approved ? "APPROVED" : "REJECTED" } as T;
  }
  if (path.match(/\/rides\/[^/?]+/) && method === "GET") {
    return {
      id: "r1",
      passengerId: "1",
      driverId: "2",
      status: "IN_PROGRESS",
      vehicleType: "STANDARD",
      pickupAddress: "Gombe, Kinshasa",
      dropoffAddress: "Limete, Kinshasa",
      priceCdf: 8500,
      createdAt: new Date().toISOString(),
    } as T;
  }
  if (path.includes("/rides") && method === "POST") {
    return { id: path.split("/")[3], status: "CANCELLED" } as T;
  }
  if (path.includes("/rides")) {
    return [
      {
        id: "r1",
        passengerId: "1",
        driverId: "2",
        status: "COMPLETED",
        vehicleType: "STANDARD",
        pickupAddress: "Gombe",
        dropoffAddress: "Limete",
        priceCdf: 8500,
        createdAt: new Date().toISOString(),
      },
      {
        id: "r2",
        passengerId: "1",
        status: "SEARCHING",
        vehicleType: "MOTO_TAXI",
        pickupAddress: "Bandal",
        dropoffAddress: "Kintambo",
        priceCdf: 3500,
        createdAt: new Date().toISOString(),
      },
    ] as T;
  }
  if (path.match(/\/deliveries\/[^/?]+/) && method === "GET") {
    return {
      id: "del-1",
      type: "PARCEL",
      status: "IN_TRANSIT",
      pickupAddress: "Gombe",
      dropoffAddress: "Ngaliema",
      priceCdf: 5000,
      events: [{ event: "PENDING", createdAt: new Date().toISOString() }],
    } as T;
  }
  if (path.includes("/deliveries") && method === "PATCH") {
    return { id: path.split("/")[3], status: body.status } as T;
  }
  if (path.includes("/deliveries")) {
    return [
      { id: "del-1", type: "PARCEL", status: "IN_TRANSIT", pickupAddress: "Gombe", dropoffAddress: "Ngaliema", priceCdf: 5000 },
      { id: "del-2", type: "FOOD", status: "PENDING", restaurantName: "Chez Mama", priceCdf: 12000 },
      { id: "del-3", type: "EXPRESS", status: "DELIVERED", pickupAddress: "Bandal", dropoffAddress: "Kintambo", priceCdf: 4500 },
    ] as T;
  }
  if (path.includes("/scheduled-rides") && method === "POST") {
    return { id: path.split("/")[3], status: "CANCELLED" } as T;
  }
  if (path.includes("/scheduled-rides")) {
    return [
      {
        id: "sch-1",
        passengerId: "1",
        pickupAddress: "Gombe",
        dropoffAddress: "Aéroport N'djili",
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        status: "SCHEDULED",
        priceCdf: 25000,
      },
    ] as T;
  }
  if (path.includes("/restaurants") && method !== "GET") {
    return { id: "rest-1", name: body.name ?? "Nouveau restaurant", isActive: true, ...body } as T;
  }
  if (path.includes("/restaurants")) {
    return [
      {
        id: "rest-1",
        name: "Chez Mama",
        cuisine: "Congolaise",
        address: "Av. du Commerce, Gombe",
        lat: -4.3217,
        lng: 15.3125,
        rating: 4.5,
        isActive: true,
        menuItems: [{ name: "Poulet moambe", priceCdf: 8000 }],
      },
    ] as T;
  }
  if (path.includes("/rental-vehicles") && method !== "GET") {
    return { id: "rv-1", name: body.name ?? "Véhicule", isActive: true, dailyRateCdf: 45000, category: "ECONOMY", ...body } as T;
  }
  if (path.includes("/rental-vehicles")) {
    return [
      {
        id: "rv-1",
        name: "Toyota Corolla",
        category: "ECONOMY",
        city: "Kinshasa",
        dailyRateCdf: 45000,
        seats: 5,
        isActive: true,
        ownerName: "Jean K.",
        ownerContactPhone: "+243812345678",
      },
    ] as T;
  }
  if (path.includes("/uploads/vehicle-photo") && method === "POST") {
    return { photoUrl: "/api/uploads/vehicles/mock-vehicle.jpg" } as T;
  }
  if (path.includes("/delivery-pricing-rules") && method !== "GET") {
    return { category: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/delivery-pricing-rules")) {
    return [
      { category: "PARCEL", baseFeeCdf: 0, multiplier: 1.0, description: "Colis — tarif course Standard + poids", isActive: true },
      { category: "FOOD", baseFeeCdf: 3000, multiplier: 1.0, description: "Livraison repas — frais de base CDF", isActive: true },
      { category: "EXPRESS", baseFeeCdf: 0, multiplier: 1.35, description: "Livraison express — majoration 35%", isActive: true },
    ] as T;
  }
  if (path.includes("/errand-category-estimates") && method !== "GET") {
    return { category: body.category ?? path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/errand-category-estimates")) {
    return [
      { category: "PHARMACY", label: "Pharmacie", perItemCdf: 8000, keywordPattern: "pharmac|medic", sortOrder: 1, isActive: true },
      { category: "MARKET", label: "Marché", perItemCdf: 3000, keywordPattern: "marché|market", sortOrder: 2, isActive: true },
      { category: "OTHER", label: "Autre", perItemCdf: 5000, keywordPattern: null, sortOrder: 3, isActive: true },
    ] as T;
  }
  if (path.includes("/subscription-plans") && method === "POST") {
    return {
      id: `plan-${Date.now()}`,
      name: body.name ?? "Nouveau plan",
      priceCdfPerMonth: body.priceCdfPerMonth ?? 0,
      benefits: body.benefits ?? [],
      isActive: true,
      subscriberCount: 0,
    } as T;
  }
  if (path.match(/\/subscription-plans\/[^/?]+/) && method === "PATCH") {
    return { id: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/subscription-plans")) {
    return [
      {
        id: "plan-basic",
        name: "SENGA Basic",
        priceCdfPerMonth: 5000,
        benefits: ["5 % de réduction courses", "Support prioritaire"],
        isActive: true,
        subscriberCount: 128,
      },
      {
        id: "plan-plus",
        name: "SENGA Plus",
        priceCdfPerMonth: 12000,
        benefits: ["10 % réduction", "Livraisons offertes (2/mois)", "Annulation gratuite"],
        isActive: true,
        subscriberCount: 42,
      },
      {
        id: "plan-pro",
        name: "SENGA Pro",
        priceCdfPerMonth: 25000,
        benefits: ["15 % réduction", "Livraisons illimitées", "Chauffeur VIP"],
        isActive: false,
        subscriberCount: 7,
      },
    ] as T;
  }
  if (path.includes("/subscriptions")) {
    return [
      { id: "sub-1", userId: "1", planId: "plan-basic", planName: "SENGA Basic", status: "ACTIVE", startedAt: new Date().toISOString() },
      { id: "sub-2", userId: "2", planId: "plan-plus", planName: "SENGA Plus", status: "ACTIVE", startedAt: new Date().toISOString() },
    ] as T;
  }
  if (path.includes("/wallet/overview")) {
    return { totalBalanceCdf: 12500000, pendingPayoutsCdf: 890000, transactionsToday: 156 } as T;
  }
  if (path.includes("/users/me")) {
    const role = normalizeAdminRole(roleFromToken()) ?? "ADMIN";
    return {
      id: "1",
      phone: "+243900000001",
      phoneMasked: "+243 *** 0001",
      role,
      firstName: "Admin",
      lastName: "SENGA",
      googleLinked: false,
      hasPhone: true,
      canUnlinkGoogle: false,
      canUnlinkPhone: false,
    } as T;
  }
  if (path.includes("/pricing-rules") && method !== "GET") {
    return { vehicleType: path.split("/").pop(), ...body } as T;
  }
  if (path.includes("/pricing-rules")) {
    return [
      { vehicleType: "MOTO_TAXI", city: "Kinshasa", baseFareCdf: 1500, perKmCdf: 800, perMinuteCdf: 100, minFareCdf: 2000, peakMultiplier: 1.3, nightMultiplier: 1.2, isActive: true },
      { vehicleType: "STANDARD", city: "Kinshasa", baseFareCdf: 3000, perKmCdf: 1500, perMinuteCdf: 200, minFareCdf: 5000, peakMultiplier: 1.3, nightMultiplier: 1.2, isActive: true },
      { vehicleType: "COMFORT", city: "Kinshasa", baseFareCdf: 5000, perKmCdf: 2500, perMinuteCdf: 300, minFareCdf: 8000, peakMultiplier: 1.4, nightMultiplier: 1.3, isActive: true },
      { vehicleType: "VIP", city: "Kinshasa", baseFareCdf: 8000, perKmCdf: 3500, perMinuteCdf: 400, minFareCdf: 12000, peakMultiplier: 1.5, nightMultiplier: 1.4, isActive: true },
    ] as T;
  }
  if (path.includes("/fraud/incident") && method === "POST") {
    return {
      created: true,
      alreadyExists: false,
      incidentId: "inc-fraud-demo",
      message: "Litige ouvert avec succès.",
    } as T;
  }
  if (path.includes("/fraud/alerts")) {
    return {
      periodDays: 30,
      generatedAt: new Date().toISOString(),
      autoIncidentThreshold: 60,
      summary: { totalAlerts: 2, highSeverity: 1, cancellationsAfterAccept: 5, unpaidCompleted: 3, recurringPairs: 1, incidentsCreated: 1 },
      alerts: [
        {
          entityId: "2",
          entityType: "DRIVER",
          score: 76,
          severity: "HIGH",
          cancellationsAfterAccept: 4,
          unpaidCompleted: 2,
          recurringPairs: 1,
          counterpartIds: ["1"],
          reasons: [
            "4 annulation(s) après acceptation (course possible hors app)",
            "1 binôme(s) récurrent(s) hors système",
            "2 course(s) terminée(s) sans paiement validé",
          ],
          sampleRideIds: ["r1", "r2", "r3"],
          incidentCreated: true,
        },
        {
          entityId: "1",
          entityType: "PASSENGER",
          score: 38,
          severity: "MEDIUM",
          cancellationsAfterAccept: 2,
          unpaidCompleted: 1,
          recurringPairs: 1,
          counterpartIds: ["2"],
          reasons: [
            "2 annulation(s) après acceptation (course possible hors app)",
            "1 binôme(s) récurrent(s) hors système",
            "1 course(s) terminée(s) sans paiement validé",
          ],
          sampleRideIds: ["r4", "r5"],
          incidentCreated: false,
        },
      ],
    } as T;
  }
  if (path.includes("/incidents") && method === "POST") {
    return { id: path.split("/")[3], status: "RESOLVED" } as T;
  }
  if (path.includes("/incidents")) {
    return [
      { id: "inc-1", userId: "1", type: "FRAUD", description: "Litige paiement course #r1", status: "OPEN", createdAt: new Date().toISOString() },
      { id: "inc-2", userId: "2", type: "OTHER", description: "Retard chauffeur", status: "RESOLVED", createdAt: new Date().toISOString() },
    ] as T;
  }
  if (path.includes("/geo/communes") || path.includes("/admin/communes")) {
    return [
      { id: "c1", name: "Gombe", city: "Kinshasa", lat: -4.3217, lng: 15.3125 },
      { id: "c2", name: "Limete", city: "Kinshasa", lat: -4.331, lng: 15.313 },
      { id: "c3", name: "Bandalungwa", city: "Kinshasa", lat: -4.35, lng: 15.28 },
    ] as T;
  }
  return {} as T;
}

export function normalizeMetrics(raw: AdminMetrics) {
  return {
    totalUsers: raw.totalUsers ?? raw.users ?? 0,
    activeDrivers: raw.activeDrivers ?? raw.drivers ?? 0,
    availableDrivers: raw.availableDrivers ?? 0,
    pendingKyc: raw.pendingKyc ?? 0,
    approvedDrivers: raw.approvedDrivers ?? 0,
    ridesToday: raw.ridesToday ?? raw.todayRides ?? 0,
    todayCompleted: raw.todayCompleted ?? 0,
    revenueTodayCdf: raw.revenueTodayCdf ?? raw.revenueCdf ?? 0,
    totalRides: raw.rides ?? 0,
    completedRides: raw.completedRides ?? 0,
    totalRevenueCdf: raw.revenueCdf ?? 0,
    activeRides: raw.activeRides ?? 0,
    activeDeliveries: raw.activeDeliveries ?? 0,
    cancelledRides: raw.cancelledRides ?? 0,
    openIncidents: raw.openIncidents ?? 0,
    sosIncidents: raw.sosIncidents ?? 0,
    scheduledRides: raw.scheduledRides ?? 0,
    carpoolTrips: raw.carpoolTrips ?? 0,
    movingRequests: raw.movingRequests ?? 0,
    rentalInquiries: raw.rentalInquiries ?? 0,
    walletBalanceCdf: raw.walletBalanceCdf ?? 0,
    walletCount: raw.walletCount ?? 0,
    walletTransactionsToday: raw.walletTransactionsToday ?? 0,
    city: raw.city ?? "RDC",
  };
}

export async function fetchAdminReports(days = 30): Promise<AdminReports> {
  return apiFetch<AdminReports>(`/api/admin/reports?days=${days}`);
}

export function exportReportsCsv(reports: AdminReports, metrics: ReturnType<typeof normalizeMetrics>) {
  const lines = [
    "SENGA — Rapport analytique",
    `Généré;${reports.generatedAt}`,
    `Période (jours);${reports.periodDays}`,
    "",
    "Indicateur;Valeur",
    `Utilisateurs;${metrics.totalUsers}`,
    `Chauffeurs approuvés;${metrics.approvedDrivers}`,
    `Courses (période);${reports.kpis.totalRides}`,
    `Taux complétion;${(reports.kpis.completionRate * 100).toFixed(1)}%`,
    `Taux annulation;${(reports.kpis.cancelRate * 100).toFixed(1)}%`,
    `Revenus courses;${reports.kpis.totalRevenueCdf}`,
    `Panier moyen;${reports.kpis.avgTicketCdf}`,
    "",
    "Date;Courses;Complétées;Revenus FC;Annulées;Livraisons",
    ...reports.daily.map(
      (d) => `${d.date};${d.rides};${d.completed};${d.revenueCdf};${d.cancelled};${d.deliveries}`,
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mova-rapport-${reports.periodDays}j-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatUserName(u: AdminUser) {
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || u.phone || u.id;
}

export function formatCdf(amount?: number) {
  return `${(amount ?? 0).toLocaleString("fr-CD")} FC`;
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-CD");
}

export async function fetchCommunes(city = "Kinshasa"): Promise<Commune[]> {
  const q = encodeURIComponent(city);
  return apiFetch<Commune[]>(`/api/admin/communes?city=${q}`);
}

export type PoiSuggestion = {
  id: string;
  userId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  city: string;
  address?: string | null;
  notes?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  publishedPoiId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchPoiSuggestions(status = "PENDING", skip = 0, take = 50) {
  const params = new URLSearchParams({ status, skip: String(skip), take: String(take) });
  return apiFetch<{ items: PoiSuggestion[]; total: number }>(`/api/admin/poi-suggestions?${params}`);
}

export async function approvePoiSuggestion(id: string, body: Record<string, unknown> = {}) {
  return apiFetch<{ suggestion: PoiSuggestion; poi: Record<string, unknown>; osm?: { editUrl?: string } }>(
    `/api/admin/poi-suggestions/${id}/approve`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function rejectPoiSuggestion(id: string, body: { reason?: string } = {}) {
  return apiFetch<{ suggestion: PoiSuggestion }>(`/api/admin/poi-suggestions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function createCommune(data: { name: string; city: string; lat: number; lng: number }) {
  return apiFetch<Commune>("/api/admin/communes", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteCommune(id: string) {
  return apiFetch(`/api/admin/communes/${id}`, { method: "DELETE" });
}

export async function fetchProvinces(): Promise<Province[]> {
  return apiFetch<Province[]>("/api/admin/provinces");
}

export async function createProvince(name: string) {
  return apiFetch<Province>("/api/admin/provinces", { method: "POST", body: JSON.stringify({ name }) });
}

export async function updateProvince(id: string, data: { name?: string; isActive?: boolean }) {
  return apiFetch<Province>(`/api/admin/provinces/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteProvince(id: string) {
  return apiFetch(`/api/admin/provinces/${id}`, { method: "DELETE" });
}

export async function setAllProvincesActive(isActive: boolean) {
  return apiFetch<{ isActive: boolean; count: number }>("/api/admin/provinces/bulk-active", {
    method: "POST",
    body: JSON.stringify({ isActive }),
  });
}

export async function seedPoiCatalog(city = "RDC") {
  return apiFetch<{ imported: number; skipped: number }>(
    `/api/admin/poi/seed?city=${encodeURIComponent(city)}`,
    { method: "POST" },
  );
}

export async function fetchCities(provinceId?: string): Promise<AdminCity[]> {
  const q = provinceId ? `?provinceId=${encodeURIComponent(provinceId)}` : "";
  return apiFetch<AdminCity[]>(`/api/admin/cities${q}`);
}

export async function createCity(data: {
  name: string;
  slug: string;
  provinceId: string;
  centerLat: number;
  centerLng: number;
  isActive?: boolean;
}) {
  return apiFetch<AdminCity>("/api/admin/cities", { method: "POST", body: JSON.stringify(data) });
}

export async function updateCity(id: string, data: Partial<AdminCity>) {
  return apiFetch<AdminCity>(`/api/admin/cities/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteCity(id: string) {
  return apiFetch(`/api/admin/cities/${id}`, { method: "DELETE" });
}

export async function setAllCitiesActive(isActive: boolean) {
  return apiFetch<{ isActive: boolean; count: number }>("/api/admin/cities/bulk-active", {
    method: "POST",
    body: JSON.stringify({ isActive }),
  });
}

export async function updateCommune(id: string, data: Partial<Commune>) {
  return apiFetch<Commune>(`/api/admin/communes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export type WalletTransaction = {
  id: string;
  amountCdf: number;
  type: string;
  description?: string;
  reference?: string | null;
  createdAt?: string;
  wallet?: { userId: string; userName?: string | null; balanceCdf?: number };
};

export type WalletTransactionsPage = {
  data: WalletTransaction[];
  total: number;
  skip: number;
  take: number;
  currency?: string;
};

export type RentalInquiry = {
  id: string;
  userId?: string;
  passengerName?: string;
  passengerPhone?: string;
  vehicleName?: string;
  vehicleType?: string;
  ownerName?: string;
  ownerContactPhone?: string;
  ownerUserId?: string | null;
  logisticsMode?: string;
  logisticsModeLabel?: string;
  needsMovaLogistics?: boolean;
  passengerDriverName?: string | null;
  passengerDriverPhone?: string | null;
  ownerDriverName?: string | null;
  ownerDriverPhone?: string | null;
  movaDriverId?: string | null;
  status?: string;
  startDate?: string;
  endDate?: string;
  estimatedPriceCdf?: number;
  priceCdf?: number;
  pickupAddress?: string;
  pickupCity?: string;
  returnCity?: string;
  contactPhone?: string;
  notes?: string;
  driverId?: string | null;
  driverName?: string;
  driverPhone?: string;
  nextStepHint?: string | null;
  createdAt?: string;
};

export async function fetchRentalInquiries(): Promise<RentalInquiry[]> {
  const data = await apiFetch<RentalInquiry[] | { data?: RentalInquiry[] }>("/api/admin/rental-inquiries");
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function updateRentalInquiryStatus(id: string, status: string, forceOverride?: boolean) {
  return apiFetch(`/api/admin/rental-inquiries/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, forceOverride: forceOverride === true }),
  });
}

export async function cancelRentalInquiry(id: string) {
  return apiFetch(`/api/admin/rental-inquiries/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export async function assignRentalDriver(id: string, driverId: string) {
  return apiFetch(`/api/admin/rental-inquiries/${id}/assign`, { method: "PATCH", body: JSON.stringify({ driverId }) });
}

export type RentalCatalogVehicle = {
  id: string;
  name: string;
  make?: string;
  model?: string;
  year?: number;
  category: string;
  categoryLabel?: string;
  transmission?: string;
  city?: string;
  seats?: number;
  dailyRateCdf: number;
  depositCdf?: number;
  weeklyDiscountPct?: number;
  rating?: number;
  ownerName?: string;
  ownerBadge?: string;
  ownerContactPhone?: string;
  features?: string[];
  cancellationPolicy?: string;
  mileageUnlimited?: boolean;
  limitedMileageFeeCdf?: number;
  imageUrl?: string | null;
  isActive?: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalStatusLabel?: string;
  ownerUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchRentalVehicles(): Promise<RentalCatalogVehicle[]> {
  const data = await apiFetch<RentalCatalogVehicle[] | { data?: RentalCatalogVehicle[] }>("/api/admin/rental-vehicles");
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function saveRentalVehicle(data: Partial<RentalCatalogVehicle>, id?: string) {
  if (id) {
    return apiFetch<RentalCatalogVehicle>(`/api/admin/rental-vehicles/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  return apiFetch<RentalCatalogVehicle>("/api/admin/rental-vehicles", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteRentalVehicle(id: string) {
  return apiFetch(`/api/admin/rental-vehicles/${id}`, { method: "DELETE" });
}

export async function reviewRentalVehicle(id: string, action: "approve" | "reject") {
  return saveRentalVehicle(
    {
      approvalStatus: action === "approve" ? "APPROVED" : "REJECTED",
      isActive: action === "approve",
    },
    id,
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function uploadVehiclePhoto(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const mimeType = file.type || "image/jpeg";
  const result = await apiFetch<{ photoUrl?: string }>("/api/uploads/vehicle-photo", {
    method: "POST",
    body: JSON.stringify({ imageBase64: base64, mimeType }),
  });
  if (!result.photoUrl) throw new Error("URL photo manquante");
  return result.photoUrl;
}

export type MovingRequest = {
  id: string;
  userId?: string;
  passengerName?: string;
  passengerPhone?: string;
  driverId?: string | null;
  driverName?: string;
  driverPhone?: string;
  status?: string;
  volumeM3?: number;
  vehicleCategory?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  priceCdf?: number;
  estimatedPriceCdf?: number;
  createdAt?: string;
};

export type CarpoolTrip = {
  id: string;
  driverId?: string;
  driverName?: string;
  fromAddress?: string;
  toAddress?: string;
  fromCity?: string;
  toCity?: string;
  status?: string;
  seatsAvailable?: number;
  passengerCount?: number;
  pricePerSeatCdf?: number;
  departureAt?: string;
  createdAt?: string;
  vehicleInfo?: string | null;
  vehicleImageUrl?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
};

export async function fetchMovingRequests(): Promise<MovingRequest[]> {
  const data = await apiFetch<MovingRequest[] | { data?: MovingRequest[] }>("/api/admin/moving");
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function updateMovingStatus(id: string, status: string) {
  return apiFetch(`/api/admin/moving/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function assignMovingDriver(id: string, driverId: string) {
  return apiFetch(`/api/admin/moving/${id}/assign`, { method: "PATCH", body: JSON.stringify({ driverId }) });
}

export async function cancelMovingRequest(id: string) {
  return apiFetch(`/api/admin/moving/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export async function fetchCarpoolTrips(): Promise<CarpoolTrip[]> {
  const data = await apiFetch<CarpoolTrip[] | { data?: CarpoolTrip[] }>("/api/admin/carpool");
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function updateCarpoolStatus(id: string, status: string) {
  return apiFetch(`/api/admin/carpool/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function cancelCarpoolTrip(id: string) {
  return apiFetch(`/api/admin/carpool/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export async function deleteSubscriptionPlan(id: string) {
  return updateSubscriptionPlan(id, { isActive: false });
}

export async function deactivateUser(id: string) {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: "DELETE" });
}

export async function fetchUser(id: string) {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`);
}

export async function fetchRide(id: string) {
  return apiFetch<RideOverview>(`/api/admin/rides/${id}`);
}

export async function fetchGpsTrace(type: "ride" | "delivery" | "errand" | "moving", id: string) {
  return apiFetch<GpsTraceResponse>(`/api/admin/tracking/${type}/${id}/trace`);
}

export async function fetchDelivery(id: string) {
  return apiFetch<DeliveryOverview>(`/api/admin/deliveries/${id}`);
}

export async function fetchDeliveries(opts?: {
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  skip?: number;
  take?: number;
}): Promise<DeliveryOverview[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  if (opts?.search?.trim()) params.set("search", opts.search.trim());
  params.set("skip", String(opts?.skip ?? 0));
  params.set("take", String(opts?.take ?? 50));
  const data = await apiFetch<DeliveryOverview[]>(`/api/admin/deliveries?${params}`);
  return Array.isArray(data) ? data : [];
}

export async function deletePricingRule(vehicleType: string, city?: string) {
  const q = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiFetch(`/api/admin/pricing-rules/${vehicleType}${q}`, { method: "DELETE" });
}

export async function fetchWalletTransactions(userId?: string, skip = 0, take = 50): Promise<WalletTransactionsPage> {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (userId) params.set("userId", userId);
  return apiFetch<WalletTransactionsPage>(`/api/admin/wallet/transactions?${params}`);
}

export async function adjustWallet(
  userId: string,
  data: { amountCdf: number; type: "CREDIT" | "DEBIT"; description: string },
) {
  return apiFetch<{ message?: string; wallet?: { balanceCdf?: number } }>(
    `/api/admin/wallet/${userId}/adjust`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function withdrawWallet(
  userId: string,
  data: { amountCdf: number; provider: string; phone: string },
) {
  return apiFetch<{ success?: boolean; message?: string; balanceCdf?: number; reference?: string }>(
    `/api/admin/wallet/${userId}/withdraw`,
    { method: "POST", body: JSON.stringify(data) },
  );
}

export async function fetchCashDebts(driverUserId?: string): Promise<CashDebtsOverview> {
  const params = new URLSearchParams();
  if (driverUserId) params.set("driverUserId", driverUserId);
  const qs = params.toString();
  return apiFetch<CashDebtsOverview>(`/api/admin/wallet/cash-debts${qs ? `?${qs}` : ""}`);
}

export async function settleCashDebt(debtId: string, settlementRef?: string) {
  return apiFetch(`/api/admin/wallet/cash-debts/${debtId}/settle`, {
    method: "POST",
    body: JSON.stringify({ settlementRef }),
  });
}

export async function confirmCashDebtByCode(code: string) {
  return apiFetch<{ confirmed: boolean; message?: string; driverUserId?: string; amountCdf?: number }>(
    "/api/admin/wallet/cash-debts/confirm-cash",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
  );
}

export type DriverDebtPolicy = {
  id: string;
  maxOpenDebtCdf: number;
  blockOffers: boolean;
  isActive: boolean;
  updatedAt?: string;
};

export async function fetchDebtPolicy(): Promise<DriverDebtPolicy> {
  return apiFetch<DriverDebtPolicy>("/api/admin/wallet/debt-policy");
}

export async function updateDebtPolicy(data: {
  maxOpenDebtCdf?: number;
  blockOffers?: boolean;
  isActive?: boolean;
}) {
  return apiFetch<DriverDebtPolicy>("/api/admin/wallet/debt-policy", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function createUser(data: {
  phone: string;
  role: string;
  firstName?: string;
  lastName?: string;
  status?: string;
}) {
  return apiFetch<AdminUser>("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
}

export async function updateUser(id: string, data: Partial<AdminUser>) {
  return apiFetch<AdminUser>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function fetchUsers(skip = 0, take = 100, search?: string): Promise<{ data: AdminUser[]; total: number }> {
  const params = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (search?.trim()) params.set("search", search.trim());
  const raw = await apiFetch<AdminUser[] | { data?: AdminUser[]; total?: number }>(`/api/admin/users?${params}`);
  if (Array.isArray(raw)) return { data: raw, total: raw.length };
  return { data: raw.data ?? [], total: raw.total ?? raw.data?.length ?? 0 };
}

export async function fetchDrivers(): Promise<AdminDriver[]> {
  const data = await apiFetch<AdminDriver[] | { data?: AdminDriver[] }>("/api/admin/drivers");
  return Array.isArray(data) ? data : data.data ?? [];
}

export async function fetchDriversForAssignment(): Promise<AdminDriver[]> {
  const params = new URLSearchParams({ take: "200", kycStatus: "APPROVED" });
  const data = await apiFetch<AdminDriver[] | { data?: AdminDriver[] }>(`/api/admin/drivers?${params}`);
  const approved = Array.isArray(data) ? data : data.data ?? [];
  const eligible = approved.filter((d) => d.documentsCanOperate !== false);
  if (eligible.length > 0) return eligible;
  const all = await fetchDrivers();
  return all.filter((d) => d.kycStatus === "APPROVED" && d.documentsCanOperate !== false);
}

export async function fetchDriverDetail(userId: string): Promise<AdminDriverDetail> {
  return apiFetch<AdminDriverDetail>(`/api/admin/drivers/${userId}`);
}

export async function setDriverStatus(userId: string, active: boolean, suspendUser?: boolean) {
  return apiFetch(`/api/admin/drivers/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ active, suspendUser }),
  });
}

export async function reviewDriverKyc(userId: string, approved: boolean, notes?: string) {
  return apiFetch<{ activationPin?: string }>(`/api/admin/drivers/${userId}/kyc`, {
    method: "PATCH",
    body: JSON.stringify({ approved, notes }),
  });
}

export async function reviewDriverDocumentsRenewal(userId: string, approved: boolean, notes?: string) {
  return apiFetch(`/api/admin/drivers/${userId}/documents-renewal`, {
    method: "PATCH",
    body: JSON.stringify({ approved, notes }),
  });
}

export async function reviewVehicleTypeApproval(userId: string, approved: boolean, notes?: string) {
  return apiFetch(`/api/admin/drivers/${userId}/vehicle-type`, {
    method: "PATCH",
    body: JSON.stringify({ approved, notes }),
  });
}

export async function runKycOcr(documentId: string) {
  return apiFetch<{
    documentId: string;
    userId: string;
    type: string;
    ocr?: {
      documentId?: string;
      status?: string;
      extractedExpiry?: string | null;
      profileExpiry?: string | null;
      confidence?: number | null;
      notes?: string | null;
      checkedAt?: string | null;
    } | null;
  }>(`/api/admin/kyc/${documentId}/ocr`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function regenerateDriverActivationPin(userId: string) {
  return apiFetch<{ activationPin: string; publicId?: string }>(`/api/admin/drivers/${userId}/activation-pin`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelRide(id: string, reason?: string) {
  return apiFetch(`/api/admin/rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function updateRideStatus(id: string, status: string, reason?: string) {
  return apiFetch(`/api/admin/rides/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason }) });
}

export async function cancelScheduledRide(id: string, reason?: string) {
  return apiFetch(`/api/admin/scheduled-rides/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function updateScheduledRideStatus(id: string, status: string) {
  return apiFetch(`/api/admin/scheduled-rides/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function assignScheduledDriver(id: string, driverId: string) {
  return apiFetch(`/api/admin/scheduled-rides/${id}/assign`, { method: "PATCH", body: JSON.stringify({ driverId }) });
}

export async function updateDeliveryStatus(id: string, status: string) {
  return apiFetch(`/api/admin/deliveries/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function assignDeliveryDriver(id: string, driverId: string) {
  return apiFetch(`/api/admin/deliveries/${id}/assign`, { method: "PATCH", body: JSON.stringify({ driverId }) });
}

export async function cancelDelivery(id: string, reason?: string) {
  return apiFetch(`/api/admin/deliveries/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function resolveIncident(id: string, status = "RESOLVED") {
  return apiFetch(`/api/admin/incidents/${id}/resolve`, { method: "POST", body: JSON.stringify({ status }) });
}

export async function fetchFraudAlerts(days = 30, autoCreate = true): Promise<FraudAlertsResponse> {
  const params = new URLSearchParams({ days: String(days), autoCreate: autoCreate ? "true" : "false" });
  return apiFetch<FraudAlertsResponse>(`/api/admin/fraud/alerts?${params}`);
}

export async function createFraudIncident(alert: Pick<FraudAlert, "entityId" | "entityType" | "reasons" | "score">) {
  return apiFetch<FraudIncidentResult>("/api/admin/fraud/incident", {
    method: "POST",
    body: JSON.stringify({
      entityId: alert.entityId,
      entityType: alert.entityType,
      reasons: alert.reasons,
      score: alert.score,
    }),
  });
}

export async function saveRestaurant(data: Partial<Restaurant>, id?: string) {
  if (id) {
    return apiFetch<Restaurant>(`/api/admin/restaurants/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  return apiFetch<Restaurant>("/api/admin/restaurants", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteRestaurant(id: string) {
  return apiFetch(`/api/admin/restaurants/${id}`, { method: "DELETE" });
}

export async function fetchPublicites(): Promise<Publicite[]> {
  const raw = await apiFetch<Publicite[]>("/api/admin/publicites");
  return Array.isArray(raw) ? raw : [];
}

export async function savePublicite(data: Partial<Publicite>, id?: string) {
  if (id) {
    return apiFetch<Publicite>(`/api/admin/publicites/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  return apiFetch<Publicite>("/api/admin/publicites", { method: "POST", body: JSON.stringify(data) });
}

export async function deletePublicite(id: string) {
  return apiFetch(`/api/admin/publicites/${id}`, { method: "DELETE" });
}

export async function fetchCurrentUser(): Promise<AdminSessionUser> {
  return apiFetch<AdminSessionUser>("/api/users/me");
}

export async function fetchPricingRules(city?: string): Promise<PricingRule[]> {
  const q = city ? `?city=${encodeURIComponent(city)}` : "";
  return apiFetch<PricingRule[]>(`/api/admin/pricing-rules${q}`);
}

export async function updatePricingRule(vehicleType: string, data: Partial<PricingRule>) {
  return apiFetch<PricingRule>(`/api/admin/pricing-rules/${vehicleType}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function createPricingRule(vehicleType: string, data: Partial<PricingRule>) {
  return apiFetch<PricingRule>(`/api/admin/pricing-rules/${vehicleType}`, { method: "POST", body: JSON.stringify(data) });
}

export async function fetchDeliveryPricingRules(): Promise<DeliveryPricingRule[]> {
  return apiFetch<DeliveryPricingRule[]>("/api/admin/delivery-pricing-rules");
}

export async function updateDeliveryPricingRule(category: string, data: Partial<DeliveryPricingRule>) {
  return apiFetch<DeliveryPricingRule>(`/api/admin/delivery-pricing-rules/${category}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchErrandCategoryEstimates(): Promise<ErrandCategoryEstimate[]> {
  const raw = await apiFetch<ErrandCategoryEstimate[]>("/api/admin/errand-category-estimates");
  return Array.isArray(raw) ? raw : [];
}

export async function createErrandCategoryEstimate(data: ErrandCategoryEstimate) {
  return apiFetch<ErrandCategoryEstimate>("/api/admin/errand-category-estimates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateErrandCategoryEstimate(category: string, data: Partial<ErrandCategoryEstimate>) {
  return apiFetch<ErrandCategoryEstimate>(`/api/admin/errand-category-estimates/${category}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteErrandCategoryEstimate(category: string) {
  return apiFetch<ErrandCategoryEstimate>(`/api/admin/errand-category-estimates/${category}`, {
    method: "DELETE",
  });
}

export async function fetchPricingTimeWindows(city?: string): Promise<PricingTimeWindowsList> {
  const q = city ? `?city=${encodeURIComponent(city)}` : "";
  const raw = await apiFetch<PricingTimeWindowsList | PricingTimeWindow[]>(`/api/admin/pricing-time-windows${q}`);
  if (Array.isArray(raw)) {
    return { timezone: "Africa/Kinshasa", windows: raw };
  }
  return {
    timezone: raw.timezone ?? "Africa/Kinshasa",
    windows: Array.isArray(raw.windows) ? raw.windows : [],
  };
}

export async function createPricingTimeWindow(data: Omit<PricingTimeWindow, "id">) {
  return apiFetch<PricingTimeWindow>("/api/admin/pricing-time-windows", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePricingTimeWindow(id: string, data: Partial<PricingTimeWindow>) {
  return apiFetch<PricingTimeWindow>(`/api/admin/pricing-time-windows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deletePricingTimeWindow(id: string) {
  return apiFetch<PricingTimeWindow>(`/api/admin/pricing-time-windows/${id}`, {
    method: "DELETE",
  });
}

export async function fetchSurcharges(): Promise<ServiceSurcharge[]> {
  const raw = await apiFetch<ServiceSurcharge[]>("/api/admin/surcharges");
  return Array.isArray(raw) ? raw : [];
}

export async function updateSurcharge(type: string, data: Partial<ServiceSurcharge>) {
  return apiFetch<ServiceSurcharge>(`/api/admin/surcharges/${type}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function fetchMovingVehicleCategories(): Promise<MovingVehicleCategoryPricing[]> {
  const raw = await apiFetch<MovingVehicleCategoryPricing[] | { data?: MovingVehicleCategoryPricing[] }>(
    "/api/admin/moving-vehicle-categories",
  );
  if (Array.isArray(raw)) return raw;
  return raw.data ?? [];
}

export async function updateMovingVehicleCategory(
  category: string,
  data: Partial<MovingVehicleCategoryPricing>,
) {
  return apiFetch<MovingVehicleCategoryPricing>(`/api/admin/moving-vehicle-categories/${category}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchPlatformConfig(): Promise<PlatformConfigResponse> {
  return apiFetch<PlatformConfigResponse>("/api/admin/platform-config");
}

export async function updatePlatformConfig(patch: Record<string, unknown>): Promise<PlatformConfigResponse> {
  return apiFetch<PlatformConfigResponse>("/api/admin/platform-config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function fetchCancellationPolicies(): Promise<CancellationPolicy[]> {
  const raw = await apiFetch<CancellationPolicy[]>("/api/admin/cancellation-policies");
  return Array.isArray(raw) ? raw : [];
}

export async function updateCancellationPolicy(
  vehicleType: string,
  data: Partial<CancellationPolicy>,
) {
  return apiFetch<CancellationPolicy>(`/api/admin/cancellation-policies/${vehicleType}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchParcelWeightBands(): Promise<ParcelWeightBand[]> {
  const raw = await apiFetch<ParcelWeightBand[]>("/api/admin/parcel-weight-bands");
  return Array.isArray(raw) ? raw : [];
}

export async function updateParcelWeightBand(category: string, data: Partial<ParcelWeightBand>) {
  return apiFetch<ParcelWeightBand>(`/api/admin/parcel-weight-bands/${category}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchCommissions(): Promise<PlatformCommission[]> {
  const raw = await apiFetch<PlatformCommission[]>("/api/admin/commissions");
  return Array.isArray(raw) ? raw : [];
}

export async function updateCommission(serviceType: string, data: Partial<PlatformCommission>) {
  return apiFetch<PlatformCommission>(`/api/admin/commissions/${serviceType}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const raw = await apiFetch<PromoCode[]>("/api/admin/promo-codes");
  return Array.isArray(raw) ? raw : [];
}

export async function createPromoCode(data: {
  code: string;
  discountPercent?: number;
  discountCdf?: number;
  maxUses?: number;
  validUntil?: string;
}) {
  return apiFetch<PromoCode>("/api/admin/promo-codes", { method: "POST", body: JSON.stringify(data) });
}

export async function updatePromoCode(id: string, data: Partial<PromoCode>) {
  return apiFetch<PromoCode>(`/api/admin/promo-codes/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deactivatePromoCode(id: string) {
  return updatePromoCode(id, { isActive: false });
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const raw = await apiFetch<Record<string, unknown>[]>("/api/admin/subscription-plans");
  return (Array.isArray(raw) ? raw : []).map(normalizeSubscriptionPlan);
}

export async function createSubscriptionPlan(data: Partial<SubscriptionPlan>) {
  const slug = (data.name ?? "PLUS").replace(/\s+/g, "_").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  const payload = {
    code: `MOVA_${slug}_${Date.now()}`,
    name: data.name,
    target: "PASSENGER",
    monthlyPriceCdf: data.priceCdfPerMonth ?? 0,
    description: data.benefits?.join(" · ") ?? "",
    feeReductionPercent: data.feeReductionPercent ?? 0,
    priorityMatching: data.priorityMatching ?? false,
  };
  const created = await apiFetch<Record<string, unknown>>("/api/admin/subscription-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeSubscriptionPlan(created);
}

export async function updateSubscriptionPlan(id: string, data: Partial<SubscriptionPlan>) {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.priceCdfPerMonth !== undefined) payload.monthlyPriceCdf = data.priceCdfPerMonth;
  if (data.benefits !== undefined) payload.description = data.benefits.join(" · ");
  if (data.feeReductionPercent !== undefined) payload.feeReductionPercent = data.feeReductionPercent;
  if (data.priorityMatching !== undefined) payload.priorityMatching = data.priorityMatching;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  const updated = await apiFetch<Record<string, unknown>>(`/api/admin/subscription-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return normalizeSubscriptionPlan(updated);
}

export async function fetchSubscriptions(): Promise<SubscriptionRecord[]> {
  const raw = await apiFetch<Record<string, unknown>[]>("/api/admin/subscriptions");
  return (Array.isArray(raw) ? raw : []).map(normalizeSubscriptionRecord);
}

function normalizeSubscriptionPlan(raw: Record<string, unknown>): SubscriptionPlan {
  const benefits: string[] = [];
  const fee = Number(raw.feeReductionPercent ?? 0);
  if (fee > 0) benefits.push(`${fee} % de réduction sur les frais`);
  if (raw.priorityMatching === true) benefits.push("Priorité de matching");
  const desc = raw.description as string | undefined;
  if (desc?.trim()) benefits.push(desc.trim());
  const fromArray = raw.benefits as string[] | undefined;
  if (fromArray?.length) benefits.push(...fromArray);

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    priceCdfPerMonth: Number(raw.priceCdfPerMonth ?? raw.monthlyPriceCdf ?? 0),
    benefits: benefits.length ? benefits : ["Aucun avantage renseigné"],
    isActive: raw.isActive !== false,
    subscriberCount: raw.subscriberCount as number | undefined,
    feeReductionPercent: fee,
    priorityMatching: raw.priorityMatching === true,
  };
}

function normalizeSubscriptionRecord(raw: Record<string, unknown>): SubscriptionRecord {
  const plan = raw.plan as Record<string, unknown> | undefined;
  return {
    id: String(raw.id ?? ""),
    userId: String(raw.userId ?? ""),
    planId: String(raw.planId ?? ""),
    planName: (raw.planName as string | undefined) ?? (plan?.name as string | undefined),
    status: String(raw.status ?? ""),
    startedAt: (raw.startedAt as string | undefined) ?? (raw.startsAt as string | undefined),
    expiresAt: (raw.expiresAt as string | undefined) ?? (raw.endsAt as string | undefined),
  };
}

export async function fetchWalletOverview(): Promise<WalletOverview> {
  return apiFetch<WalletOverview>("/api/admin/wallet/overview");
}

export type UserWalletDetail = {
  userId: string;
  userName?: string;
  balanceCdf?: number;
  currency?: string;
  transactionCount?: number;
};

export async function fetchUserWallet(userId: string): Promise<UserWalletDetail> {
  return apiFetch<UserWalletDetail>(`/api/admin/wallet/${userId}`);
}

export function assertAdminRole(role?: string | null): role is AdminRole {
  return isAdminRole(role);
}
