/**
 * List filters send calendar days (YYYY-MM-DD) from a date picker. A day must be read as the
 * whole day in Kinshasa time: "du 8 au 8 novembre" covers 8 Nov 00:00 → 23:59:59.999.
 * A full timestamp (ISO with a time) is kept as is.
 */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDayBoundary(value: string | Date | null | undefined, edge: 'start' | 'end'): Date | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const parsed = YMD_RE.test(raw)
    ? new Date(`${raw}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}+01:00`)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** `{ gte, lte }` for a Prisma date filter, or undefined when neither bound is valid. */
export function dayRangeFilter(
  from: string | Date | null | undefined,
  to: string | Date | null | undefined,
): { gte?: Date; lte?: Date } | undefined {
  const gte = parseDayBoundary(from, 'start');
  const lte = parseDayBoundary(to, 'end');
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}
