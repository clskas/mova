/** Inclusive YYYY-MM-DD period helpers (Kinshasa WAT = UTC+1). */

export function todayYmdKinshasa(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kinshasa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function resolvePartnerPeriod(opts?: {
  days?: number;
  from?: string;
  to?: string;
}): { from: Date; to: Date; fromYmd: string; toYmd: string; days: number } {
  const toYmd = opts?.to?.trim() || todayYmdKinshasa();
  let fromYmd = opts?.from?.trim() || '';
  if (!fromYmd) {
    const days = Math.min(366, Math.max(1, Math.floor(Number(opts?.days)) || 30));
    const end = new Date(`${toYmd}T12:00:00+01:00`);
    end.setDate(end.getDate() - (days - 1));
    fromYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Kinshasa',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(end);
  }
  const from = new Date(`${fromYmd}T00:00:00+01:00`);
  const to = new Date(`${toYmd}T23:59:59.999+01:00`);
  const days = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1);
  return { from, to, fromYmd, toYmd, days: Math.min(366, days) };
}
