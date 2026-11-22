/**
 * Short shared memory for the open-job lists read by the driver offer polls.
 *
 * Every online driver asks for ride, delivery and errand offers every 3 s. The open-job
 * queries (SEARCHING rides, unassigned deliveries, pending errands) return the same rows for
 * every driver; only the per-driver filtering (distance, rejections, vehicle) differs. On
 * 2026-11-22 the pool timeouts came back at the Sunday peak: ~200 errors, ride-service only.
 *
 * Each list is now read at most once per SHARED_OFFERS_TTL_MS per instance and shared by all
 * drivers polling in that window (parallel callers share the same promise). Accepting a job
 * still checks the row live, so a job taken in the meantime cannot be accepted twice.
 */
export const SHARED_OFFERS_TTL_MS = 2_000;
/** Owner contacts (restaurant phone/e-mail on food offers) change rarely. */
export const OWNER_BRIEF_TTL_MS = 60_000;
const MAX_ENTRIES = 1_000;

type Entry = { at: number; ttl: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function sharedOffersQuery<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = SHARED_OFFERS_TTL_MS,
  now = Date.now(),
): Promise<T> {
  const hit = store.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.value as Promise<T>;
  if (store.size >= MAX_ENTRIES) store.clear();
  const value = load().catch((e: unknown) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: now, ttl: ttlMs, value });
  return value;
}

/** Tests only. */
export function __clearSharedOffersCache() {
  store.clear();
}
