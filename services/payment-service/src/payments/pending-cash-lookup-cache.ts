/**
 * Short shared memory for the ride / service lookups made by « cash en attente ».
 *
 * Every online SENGA Driver app asks GET /payments/rides/pending-cash every 5 s. The answer
 * scans the latest 15 pending cash rides and 15 pending cash services of ALL drivers and
 * asked ride-service about each one (`/internal/rides/:id` loads the ride with its events,
 * ratings, tracking…) until one belonged to the caller. With a few old pending payments and
 * 20 drivers online, that is hundreds of heavy ride-service calls per second: on 2026-11-19
 * and 20 the ride-service pool timed out (« Timed out fetching a new connection »), mostly on
 * the same ride ids over and over.
 *
 * Those lookups are now shared by all drivers for PENDING_CASH_LOOKUP_TTL_MS. Confirming or
 * disputing the cash still reads the ride live.
 */
export const PENDING_CASH_LOOKUP_TTL_MS = 15_000;
const MAX_ENTRIES = 2_000;

type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function pendingCashLookup<T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = store.get(key);
  if (hit && now - hit.at < PENDING_CASH_LOOKUP_TTL_MS) return hit.value as Promise<T>;
  if (store.size >= MAX_ENTRIES) store.clear();
  // Keep the promise so drivers polling at the same moment share one call.
  const value = load().catch((e: unknown) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: now, value });
  return value;
}

/** Tests only. */
export function __clearPendingCashLookupCache() {
  store.clear();
}
