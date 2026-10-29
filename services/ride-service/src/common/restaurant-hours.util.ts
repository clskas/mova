/** openingHours JSON: { mon?: [openMin, closeMin][], tue?: ..., ... } minutes from midnight Kinshasa. */

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type OpeningHoursJson = Partial<Record<(typeof DAY_KEYS)[number], Array<[number, number]>>>;

export function kinshasaNowParts(now = new Date()): { dayKey: (typeof DAY_KEYS)[number]; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Kinshasa',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? 'mon';
  const map: Record<string, (typeof DAY_KEYS)[number]> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  };
  const dayKey = map[weekday.slice(0, 3)] ?? 'mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { dayKey, minuteOfDay: hour * 60 + minute };
}

export function isWithinOpeningHours(openingHours: unknown, now = new Date()): boolean {
  if (!openingHours || typeof openingHours !== 'object') return true;
  const hours = openingHours as OpeningHoursJson;
  const { dayKey, minuteOfDay } = kinshasaNowParts(now);
  const windows = hours[dayKey];
  if (!windows || windows.length === 0) return false;
  return windows.some(([open, close]) => minuteOfDay >= open && minuteOfDay < close);
}

export function isRestaurantOpenNow(restaurant: {
  isAcceptingOrders?: boolean;
  pausedUntil?: Date | string | null;
  openingHours?: unknown;
}): { open: boolean; reason?: string } {
  if (restaurant.isAcceptingOrders === false) {
    return { open: false, reason: 'Commandes désactivées' };
  }
  if (restaurant.pausedUntil) {
    const until = new Date(restaurant.pausedUntil).getTime();
    if (Number.isFinite(until) && until > Date.now()) {
      return { open: false, reason: 'En pause temporaire' };
    }
  }
  if (restaurant.openingHours && !isWithinOpeningHours(restaurant.openingHours)) {
    return { open: false, reason: 'Hors horaires d’ouverture' };
  }
  return { open: true };
}
