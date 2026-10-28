/** Shared period presets for admin list filters (Kinshasa calendar). */

export type PeriodPresetDays = 1 | 7 | 30 | 90;
export type PeriodMode = "all" | "preset" | "custom";

export const LIST_PERIOD_PRESETS: { days: PeriodPresetDays; label: string }[] = [
  { days: 1, label: "Auj." },
  { days: 7, label: "7j" },
  { days: 30, label: "30j" },
  { days: 90, label: "90j" },
];

export function todayYmdKinshasa(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function inclusiveDays(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00+01:00`);
  const b = Date.parse(`${to}T12:00:00+01:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 30;
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

/** Inclusive YYYY-MM-DD range ending today for the last `days` calendar days. */
export function rangeForPresetDays(days: number): { from: string; to: string } {
  const to = todayYmdKinshasa();
  const end = new Date(`${to}T12:00:00+01:00`);
  end.setDate(end.getDate() - (Math.max(1, days) - 1));
  const from = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(end);
  return { from, to };
}

/** True if `createdAt` falls within [from, to] inclusive (Kinshasa day bounds). */
export function createdAtInRange(
  createdAt: string | Date | null | undefined,
  from?: string | null,
  to?: string | null,
): boolean {
  if (!from && !to) return true;
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  if (from) {
    const a = Date.parse(`${from}T00:00:00+01:00`);
    if (Number.isFinite(a) && t < a) return false;
  }
  if (to) {
    const b = Date.parse(`${to}T23:59:59.999+01:00`);
    if (Number.isFinite(b) && t > b) return false;
  }
  return true;
}
