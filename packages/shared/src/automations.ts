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
