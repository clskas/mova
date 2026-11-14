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
};

export const DEFAULT_AUTOMATIONS: AutomationsConfig = {
  dailyReport: { enabled: true, hourKinshasa: 7 },
  anomalyAlerts: { enabled: true, minRequestsPerHour: 10, cancelRatePct: 60, unservedPerHour: 5 },
  docExpiry: { enabled: true, daysBefore: [30, 7, 1] },
  cashDebt: { enabled: true, remindAfterHours: 24, blockAfterDays: 0 },
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
  };
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
