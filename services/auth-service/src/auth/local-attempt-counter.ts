/**
 * In-memory copy of the PIN / OTP attempt counters, used when Redis does not answer.
 *
 * Security audit 2026-11-24: the Redis counters failed open, so a Redis outage allowed
 * unlimited PIN guesses. Every attempt is now also counted here (per instance), and the
 * checks fall back to this count when Redis is down.
 */
export class LocalAttemptCounter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly maxKeys = 50_000) {}

  /** Counts one attempt; the window starts at the first attempt. Returns the new count. */
  hit(key: string, ttlSec: number, now = Date.now()): number {
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.entries.size >= this.maxKeys) this.prune(now);
      entry = { count: 0, resetAt: now + ttlSec * 1000 };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return entry.count;
  }

  count(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number) {
    for (const [k, v] of this.entries) if (v.resetAt <= now) this.entries.delete(k);
    // Still full (attack across many numbers): drop the oldest half rather than grow forever.
    if (this.entries.size >= this.maxKeys) {
      let drop = Math.ceil(this.entries.size / 2);
      for (const k of this.entries.keys()) {
        if (drop-- <= 0) break;
        this.entries.delete(k);
      }
    }
  }
}
