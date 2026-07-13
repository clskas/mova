import { MARKET_RDC } from '@mova/shared';

/** Heure locale (0–23) dans le fuseau IANA donné. */
export function marketHourNow(timezone: string = MARKET_RDC.timezone): number {
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10);
  return hour === 24 ? 0 : hour;
}

/** `endHour` est exclusif ; plage overnight si startHour > endHour (ex. 22h–05h). */
export function hourInWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

export function formatHourRange(startHour: number, endHour: number): string {
  const pad = (h: number) => `${h}`.padStart(2, '0');
  return `${pad(startHour)}h–${pad(endHour)}h`;
}
