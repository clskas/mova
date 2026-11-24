/**
 * Protection for SerdiPay callbacks, which arrive without a signature.
 *
 * Security audit 2026-11-24: an unsigned « payment succeeded » is accepted when it names
 * a pending SerdiPay transaction id. Someone guessing ids could try many of them. This
 * shield:
 * - optionally accepts unsigned callbacks only from SerdiPay's addresses
 *   (`SERDIPAY_CALLBACK_IPS`, comma-separated), and
 * - stops listening to an address that sent too many unsigned callbacks naming
 *   transactions we do not know (guessing).
 */
export const UNKNOWN_REF_LIMIT = 20;
export const UNKNOWN_REF_WINDOW_MS = 15 * 60 * 1000;

type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * Caller address. On the hub, Caddy is the only proxy and it sets X-Forwarded-For itself,
 * so the last entry is the real caller (entries before it can be forged by the caller).
 */
export function callbackClientIp(headers: HeaderBag, socketIp?: string | null): string {
  const raw = headers['x-forwarded-for'];
  const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const parts = (value ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const ip = parts.length ? parts[parts.length - 1] : (socketIp ?? '');
  return ip.replace(/^::ffff:/, '') || 'unknown';
}

export function parseAllowedIps(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export class UnsignedCallbackShield {
  private readonly unknown = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly maxKeys = 10_000) {}

  /** Why an unsigned callback from [ip] must be ignored, or null when it may be processed. */
  refusal(ip: string, allowedIps: Set<string>, now = Date.now()): 'not_allowed' | 'guessing' | null {
    if (allowedIps.size > 0 && !allowedIps.has(ip)) return 'not_allowed';
    const entry = this.unknown.get(ip);
    if (entry && entry.resetAt > now && entry.count >= UNKNOWN_REF_LIMIT) return 'guessing';
    return null;
  }

  /** Records an unsigned callback naming a transaction we do not know. */
  recordUnknown(ip: string, now = Date.now()): number {
    let entry = this.unknown.get(ip);
    if (!entry || entry.resetAt <= now) {
      if (this.unknown.size >= this.maxKeys) {
        for (const [k, v] of this.unknown) if (v.resetAt <= now) this.unknown.delete(k);
        if (this.unknown.size >= this.maxKeys) this.unknown.clear();
      }
      entry = { count: 0, resetAt: now + UNKNOWN_REF_WINDOW_MS };
      this.unknown.set(ip, entry);
    }
    entry.count += 1;
    return entry.count;
  }
}
