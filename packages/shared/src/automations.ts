import { INTERNAL_API_KEY, serviceUrl } from './service-urls';

/**
 * SENGA automations, each with its own switch (super admin, Admin → Automatisations).
 * Stored in the platform config (`automations`); every service reads it from ride-service.
 */
export type AutomationsConfig = {
  /** Morning summary of the day before, in the admin alerts. */
  dailyReport: { enabled: boolean; hourKinshasa: number };
  /** Hourly checks: cancellation spike, passengers left without a driver. */
  anomalyAlerts: { enabled: boolean; minRequestsPerHour: number; cancelRatePct: number; unservedPerHour: number };
  /** Driver documents expiring: reminders N days before (push, SMS from 7 days). */
  docExpiry: { enabled: boolean; daysBefore: number[] };
  /** Cash owed at the counter: daily reminder after N hours, offers blocked after N days (0 = never). */
  cashDebt: { enabled: boolean; remindAfterHours: number; blockAfterDays: number };
  /** Daily bonus for drivers / couriers reaching N jobs (paid by SENGA the next night). */
  driverBonus: { enabled: boolean; minJobs: number; bonusCdf: number; minJobs2: number; bonus2Cdf: number };
  /** Map of the demand for drivers (requests of the last N minutes). */
  demandHeatmap: { enabled: boolean; windowMinutes: number };
  /** Referral: both get a credit when the new user finishes a first ride or delivery. */
  referral: { enabled: boolean; referrerRewardCdf: number; refereeRewardCdf: number; maxPerReferrer: number; codeEntryDays: number };
  /** SENGA Plus benefits applied automatically (discount, lower commission, priority, renewal). */
  subscriptions: { enabled: boolean; priorityBoost: number; autoRenew: boolean; remindDaysBefore: number };
  /** Company accounts: members' rides paid by their company (monthly statement). */
  corporate: { enabled: boolean };
  /** Daily selfie compared with the validated photo before going online. */
  faceCheck: { enabled: boolean; blockUntilChecked: boolean };
  /** During a ride: long stop or big detour → the passenger and the team are alerted. */
  routeAnomaly: { enabled: boolean; stopMinutes: number; detourKm: number };
  /** Driver quality: alert (and optional block) under an average on the last N ratings. */
  ratingQuality: { enabled: boolean; minAvg: number; minRatings: number; autoBlock: boolean };
  /** Morning summary of the app errors (Sentry) in the admin alerts; needs SENTRY_READ_TOKEN. */
  sentryDigest: { enabled: boolean; hourKinshasa: number };
  /** Passenger proposes the ride price (between minPct and maxPct of the estimate); drivers accept or not. */
  priceOffer: { enabled: boolean; minPct: number; maxPct: number };
  /** Tip after the ride, from the wallet, 100 % for the driver. */
  tips: { enabled: boolean; presetsCdf: number[]; maxCdf: number };
  /** Favourite drivers get the passenger's request first (first N search rounds). */
  favoriteDrivers: { enabled: boolean; priorityAttempts: number };
  /** Women passengers can ask for a woman driver (self-declared profile). */
  womenPreference: { enabled: boolean };
  /** Loyalty points: N points per 1 000 FC paid; P points = V FC of wallet credit (paid by SENGA). */
  loyalty: { enabled: boolean; pointsPer1000Cdf: number; redeemPoints: number; redeemValueCdf: number };
  /** Booking by USSD (*xxx#, no smartphone / internet) through an aggregator. */
  ussdBooking: { enabled: boolean };
  /** Booking by WhatsApp message (WhatsApp Business Cloud API). */
  whatsappBooking: { enabled: boolean };
  /** Driver going home: only rides that bring him closer (N times a day). */
  driverDestination: { enabled: boolean; maxPerDay: number; radiusKm: number };
  /** Optional trip insurance: fixed fee per ride, from the wallet (partner insurer). */
  tripInsurance: { enabled: boolean; feeCdf: number; partnerName: string };
  /** Book for someone else (child, parent…): rider's name and phone, SMS with tracking. */
  familyMode: { enabled: boolean };
};

export const DEFAULT_AUTOMATIONS: AutomationsConfig = {
  dailyReport: { enabled: true, hourKinshasa: 7 },
  anomalyAlerts: { enabled: true, minRequestsPerHour: 10, cancelRatePct: 60, unservedPerHour: 5 },
  docExpiry: { enabled: true, daysBefore: [30, 7, 1] },
  cashDebt: { enabled: true, remindAfterHours: 24, blockAfterDays: 0 },
  // Money paid by SENGA: off until the super admin turns them on.
  driverBonus: { enabled: false, minJobs: 10, bonusCdf: 5000, minJobs2: 20, bonus2Cdf: 12000 },
  demandHeatmap: { enabled: true, windowMinutes: 30 },
  referral: { enabled: false, referrerRewardCdf: 2000, refereeRewardCdf: 2000, maxPerReferrer: 20, codeEntryDays: 7 },
  subscriptions: { enabled: false, priorityBoost: 0.15, autoRenew: true, remindDaysBefore: 3 },
  corporate: { enabled: false },
  faceCheck: { enabled: false, blockUntilChecked: true },
  routeAnomaly: { enabled: true, stopMinutes: 10, detourKm: 3 },
  ratingQuality: { enabled: true, minAvg: 3.5, minRatings: 10, autoBlock: false },
  sentryDigest: { enabled: false, hourKinshasa: 8 },
  priceOffer: { enabled: false, minPct: 80, maxPct: 150 },
  tips: { enabled: false, presetsCdf: [500, 1000, 2000], maxCdf: 20000 },
  favoriteDrivers: { enabled: false, priorityAttempts: 1 },
  womenPreference: { enabled: false },
  loyalty: { enabled: false, pointsPer1000Cdf: 1, redeemPoints: 100, redeemValueCdf: 1000 },
  ussdBooking: { enabled: false },
  whatsappBooking: { enabled: false },
  driverDestination: { enabled: false, maxPerDay: 2, radiusKm: 3 },
  tripInsurance: { enabled: false, feeCdf: 200, partnerName: '' },
  familyMode: { enabled: false },
};

const int = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Fills missing values with the defaults and clamps the others (never throws). */
export function normalizeAutomations(raw: unknown, base: AutomationsConfig = DEFAULT_AUTOMATIONS): AutomationsConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, Record<string, unknown> | undefined>;
  const dr = o.dailyReport ?? {};
  const an = o.anomalyAlerts ?? {};
  const de = o.docExpiry ?? {};
  const cd = o.cashDebt ?? {};
  const db = o.driverBonus ?? {};
  const hm = o.demandHeatmap ?? {};
  const rf = o.referral ?? {};
  const sb = o.subscriptions ?? {};
  const co = o.corporate ?? {};
  const fc = o.faceCheck ?? {};
  const ra = o.routeAnomaly ?? {};
  const rq = o.ratingQuality ?? {};
  const sd = o.sentryDigest ?? {};
  const minJobs = int(db.minJobs, base.driverBonus.minJobs, 1, 200);
  const days = Array.isArray(de.daysBefore)
    ? [...new Set((de.daysBefore as unknown[]).map((d) => int(d, 0, 0, 90)).filter((d) => d > 0))].sort((a, b) => b - a)
    : base.docExpiry.daysBefore;
  return {
    dailyReport: {
      enabled: bool(dr.enabled, base.dailyReport.enabled),
      hourKinshasa: int(dr.hourKinshasa, base.dailyReport.hourKinshasa, 0, 23),
    },
    anomalyAlerts: {
      enabled: bool(an.enabled, base.anomalyAlerts.enabled),
      minRequestsPerHour: int(an.minRequestsPerHour, base.anomalyAlerts.minRequestsPerHour, 1, 1000),
      cancelRatePct: int(an.cancelRatePct, base.anomalyAlerts.cancelRatePct, 1, 100),
      unservedPerHour: int(an.unservedPerHour, base.anomalyAlerts.unservedPerHour, 1, 1000),
    },
    docExpiry: {
      enabled: bool(de.enabled, base.docExpiry.enabled),
      daysBefore: days.length ? days.slice(0, 5) : base.docExpiry.daysBefore,
    },
    cashDebt: {
      enabled: bool(cd.enabled, base.cashDebt.enabled),
      remindAfterHours: int(cd.remindAfterHours, base.cashDebt.remindAfterHours, 1, 720),
      blockAfterDays: int(cd.blockAfterDays, base.cashDebt.blockAfterDays, 0, 90),
    },
    driverBonus: {
      enabled: bool(db.enabled, base.driverBonus.enabled),
      minJobs,
      bonusCdf: int(db.bonusCdf, base.driverBonus.bonusCdf, 0, 1_000_000),
      // Second tier: above the first one, 0 = none.
      minJobs2: Math.max(0, int(db.minJobs2, base.driverBonus.minJobs2, 0, 500)) > minJobs
        ? int(db.minJobs2, base.driverBonus.minJobs2, 0, 500)
        : 0,
      bonus2Cdf: int(db.bonus2Cdf, base.driverBonus.bonus2Cdf, 0, 2_000_000),
    },
    demandHeatmap: {
      enabled: bool(hm.enabled, base.demandHeatmap.enabled),
      windowMinutes: int(hm.windowMinutes, base.demandHeatmap.windowMinutes, 5, 180),
    },
    referral: {
      enabled: bool(rf.enabled, base.referral.enabled),
      referrerRewardCdf: int(rf.referrerRewardCdf, base.referral.referrerRewardCdf, 0, 100_000),
      refereeRewardCdf: int(rf.refereeRewardCdf, base.referral.refereeRewardCdf, 0, 100_000),
      maxPerReferrer: int(rf.maxPerReferrer, base.referral.maxPerReferrer, 1, 1000),
      codeEntryDays: int(rf.codeEntryDays, base.referral.codeEntryDays, 1, 90),
    },
    subscriptions: {
      enabled: bool(sb.enabled, base.subscriptions.enabled),
      priorityBoost: Math.min(1, Math.max(0, Number.isFinite(Number(sb.priorityBoost)) ? Number(sb.priorityBoost) : base.subscriptions.priorityBoost)),
      autoRenew: bool(sb.autoRenew, base.subscriptions.autoRenew),
      remindDaysBefore: int(sb.remindDaysBefore, base.subscriptions.remindDaysBefore, 0, 15),
    },
    corporate: { enabled: bool(co.enabled, base.corporate.enabled) },
    faceCheck: {
      enabled: bool(fc.enabled, base.faceCheck.enabled),
      blockUntilChecked: bool(fc.blockUntilChecked, base.faceCheck.blockUntilChecked),
    },
    routeAnomaly: {
      enabled: bool(ra.enabled, base.routeAnomaly.enabled),
      stopMinutes: int(ra.stopMinutes, base.routeAnomaly.stopMinutes, 3, 60),
      detourKm: int(ra.detourKm, base.routeAnomaly.detourKm, 1, 50),
    },
    ratingQuality: {
      enabled: bool(rq.enabled, base.ratingQuality.enabled),
      minAvg: Math.min(5, Math.max(1, Number.isFinite(Number(rq.minAvg)) ? Number(rq.minAvg) : base.ratingQuality.minAvg)),
      minRatings: int(rq.minRatings, base.ratingQuality.minRatings, 3, 200),
      autoBlock: bool(rq.autoBlock, base.ratingQuality.autoBlock),
    },
    sentryDigest: {
      enabled: bool(sd.enabled, base.sentryDigest.enabled),
      hourKinshasa: int(sd.hourKinshasa, base.sentryDigest.hourKinshasa, 0, 23),
    },
    priceOffer: (() => {
      const po = o.priceOffer ?? {};
      const minPct = int(po.minPct, base.priceOffer.minPct, 50, 100);
      return {
        enabled: bool(po.enabled, base.priceOffer.enabled),
        minPct,
        maxPct: Math.max(minPct, int(po.maxPct, base.priceOffer.maxPct, 100, 300)),
      };
    })(),
    tips: (() => {
      const tp = o.tips ?? {};
      const presets = Array.isArray(tp.presetsCdf)
        ? (tp.presetsCdf as unknown[]).map((v) => int(v, 0, 0, 100_000)).filter((v) => v > 0).slice(0, 4)
        : base.tips.presetsCdf;
      return {
        enabled: bool(tp.enabled, base.tips.enabled),
        presetsCdf: presets.length ? presets : base.tips.presetsCdf,
        maxCdf: int(tp.maxCdf, base.tips.maxCdf, 100, 200_000),
      };
    })(),
    favoriteDrivers: {
      enabled: bool(o.favoriteDrivers?.enabled, base.favoriteDrivers.enabled),
      priorityAttempts: int(o.favoriteDrivers?.priorityAttempts, base.favoriteDrivers.priorityAttempts, 1, 5),
    },
    womenPreference: { enabled: bool(o.womenPreference?.enabled, base.womenPreference.enabled) },
    loyalty: {
      enabled: bool(o.loyalty?.enabled, base.loyalty.enabled),
      pointsPer1000Cdf: int(o.loyalty?.pointsPer1000Cdf, base.loyalty.pointsPer1000Cdf, 1, 100),
      redeemPoints: int(o.loyalty?.redeemPoints, base.loyalty.redeemPoints, 10, 100_000),
      redeemValueCdf: int(o.loyalty?.redeemValueCdf, base.loyalty.redeemValueCdf, 100, 1_000_000),
    },
    ussdBooking: { enabled: bool(o.ussdBooking?.enabled, base.ussdBooking.enabled) },
    whatsappBooking: { enabled: bool(o.whatsappBooking?.enabled, base.whatsappBooking.enabled) },
    driverDestination: {
      enabled: bool(o.driverDestination?.enabled, base.driverDestination.enabled),
      maxPerDay: int(o.driverDestination?.maxPerDay, base.driverDestination.maxPerDay, 1, 10),
      radiusKm: int(o.driverDestination?.radiusKm, base.driverDestination.radiusKm, 1, 20),
    },
    tripInsurance: {
      enabled: bool(o.tripInsurance?.enabled, base.tripInsurance.enabled),
      feeCdf: int(o.tripInsurance?.feeCdf, base.tripInsurance.feeCdf, 50, 50_000),
      partnerName: String(o.tripInsurance?.partnerName ?? base.tripInsurance.partnerName).trim().slice(0, 80),
    },
    familyMode: { enabled: bool(o.familyMode?.enabled, base.familyMode.enabled) },
  };
}

/** Active SENGA Plus plan of a user (payment-service), cached 5 minutes; null if none. */
const subCache = new Map<string, { at: number; value: ActivePlan | null }>();
export type ActivePlan = { target: 'PASSENGER' | 'DRIVER'; code: string; name: string; feeReductionPercent: number; priorityMatching: boolean };
export async function fetchActivePlan(userId: string, target: 'PASSENGER' | 'DRIVER'): Promise<ActivePlan | null> {
  const key = `${userId}:${target}`;
  const hit = subCache.get(key);
  if (hit && Date.now() - hit.at < 300_000) return hit.value;
  try {
    const res = await fetch(serviceUrl('payment', `/internal/subscriptions/active/${userId}?target=${target}`), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      signal: AbortSignal.timeout(4000),
    });
    const value = res.ok ? ((await res.json()) as { plan?: ActivePlan | null }).plan ?? null : null;
    subCache.set(key, { at: Date.now(), value });
    if (subCache.size > 5000) subCache.clear();
    return value;
  } catch {
    return hit?.value ?? null;
  }
}

/** Bonus earned for a number of jobs in a day (pure, tested): highest tier reached, else 0. */
export function bonusForJobs(jobs: number, b: AutomationsConfig['driverBonus']): number {
  if (!b.enabled) return 0;
  if (b.minJobs2 > 0 && jobs >= b.minJobs2) return b.bonus2Cdf;
  if (jobs >= b.minJobs) return b.bonusCdf;
  return 0;
}

let cache: { at: number; value: AutomationsConfig } | null = null;

/** Automations as set in the admin (ride-service), cached 2 minutes; defaults if unreachable. */
export async function fetchAutomations(): Promise<AutomationsConfig> {
  if (cache && Date.now() - cache.at < 120_000) return cache.value;
  try {
    const res = await fetch(serviceUrl('ride', '/internal/platform-config'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cache?.value ?? DEFAULT_AUTOMATIONS;
    const body = (await res.json()) as { config?: { automations?: unknown } };
    cache = { at: Date.now(), value: normalizeAutomations(body.config?.automations) };
    return cache.value;
  } catch {
    return cache?.value ?? DEFAULT_AUTOMATIONS;
  }
}

/** Day key and hour in Kinshasa (the platform's calendar). */
export function kinshasaClock(now = new Date()): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kinshasa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Admin alert (bell in the admin), best effort. */
export async function postStaffAlert(alert: {
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string;
  city?: string | null;
  href?: string | null;
}): Promise<void> {
  try {
    await fetch(serviceUrl('notification', '/internal/staff-alerts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* best effort */
  }
}

let demoCache: { at: number; ids: Set<string> } | null = null;

/**
 * Store-review demo accounts (+2439000000xx, code 123456 when ALLOW_TEST_OTP is on), cached
 * 5 minutes. They must never meet real customers nor take money out (security audit).
 */
export async function fetchDemoAccountIds(): Promise<Set<string>> {
  if (demoCache && Date.now() - demoCache.at < 300_000) return demoCache.ids;
  try {
    const res = await fetch(serviceUrl('auth', '/internal/users/report-test-accounts?scope=demo'), {
      headers: { 'x-internal-api-key': INTERNAL_API_KEY },
      signal: AbortSignal.timeout(4000),
    });
    const body = res.ok ? ((await res.json()) as { ids?: string[] }) : { ids: [] };
    demoCache = { at: Date.now(), ids: new Set(body.ids ?? []) };
  } catch {
    demoCache = { at: Date.now(), ids: demoCache?.ids ?? new Set() };
  }
  return demoCache.ids;
}

/** Demo customers only meet demo drivers, real customers never meet them (pure, tested). */
export function filterDriversForCustomer<T extends { userId: string }>(drivers: T[], customerId: string, demoIds: Set<string>): T[] {
  const demoCustomer = demoIds.has(customerId);
  return drivers.filter((d) => demoIds.has(d.userId) === demoCustomer);
}

/** Price a passenger may propose: clamped between minPct and maxPct of the estimate (pure, tested). */
export function clampProposedFare(estimateCdf: number, proposedCdf: number, cfg: { minPct: number; maxPct: number }): number {
  const min = Math.ceil((estimateCdf * cfg.minPct) / 100 / 100) * 100;
  const max = Math.floor((estimateCdf * cfg.maxPct) / 100 / 100) * 100;
  const p = Math.round(proposedCdf / 100) * 100;
  return Math.min(Math.max(p, min), Math.max(min, max));
}

/** Loyalty points earned for an amount paid (pure, tested). */
export function loyaltyPointsFor(paidCdf: number, pointsPer1000Cdf: number): number {
  return Math.max(0, Math.floor(paidCdf / 1000) * pointsPer1000Cdf);
}

/** Favourite drivers first during the first rounds, everyone after (pure, tested). */
export function favoriteDriversFirst<T extends { userId: string }>(drivers: T[], favorites: Set<string>, attempt: number, priorityAttempts: number): T[] {
  if (favorites.size === 0 || attempt >= priorityAttempts) return drivers;
  const fav = drivers.filter((d) => favorites.has(d.userId));
  return fav.length ? fav : drivers;
}

/** Straight-line distance in km (pure). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/**
 * Driver heading home: a ride fits when its drop-off is near the driver's destination, or
 * brings him at least 1 km closer to it than where he is now (pure, tested).
 */
export function rideFitsDriverDestination(
  driver: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  dropoff: { lat: number; lng: number },
  radiusKm: number,
): boolean {
  const fromDropoff = haversineKm(dropoff.lat, dropoff.lng, dest.lat, dest.lng);
  if (fromDropoff <= radiusKm) return true;
  return fromDropoff <= haversineKm(driver.lat, driver.lng, dest.lat, dest.lng) - 1;
}

/** USSD (Africa's Talking style): the cumulative input « 1*Gombe*Limete*1 » split into steps (pure). */
export function ussdSteps(text: string | undefined | null): string[] {
  const t = String(text ?? '').trim();
  return t ? t.split('*').map((x) => x.trim()) : [];
}
