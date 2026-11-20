import { fetchDriverDebtStatus } from './driver-debt.util';
import { fetchDriverProfileSnapshot } from './driver-eligibility.util';

/**
 * Short memory for the driver lookups made by the offer lists.
 *
 * The SENGA Driver app asks for ride, delivery and errand offers every 3 s while the driver
 * is online, and each list called driver-service (profile) and payment-service (debts)
 * before touching the database. On 2026-11-19 the two 0.5 CPU ride-service instances sat at
 * 100 % for long stretches and the database calls failed (pool timeouts, « Can't reach
 * database server ») while the database itself stayed near 5 % CPU.
 *
 * The offer lists now reuse those answers for OFFERS_LOOKUP_TTL_MS per driver. Accepting a
 * job still checks live (assertDriverEligibleFor* call the uncached lookups).
 */
export const OFFERS_LOOKUP_TTL_MS = 10_000;
const MAX_ENTRIES = 5_000;

type Entry<T> = { at: number; value: Promise<T> };

function cached<T>(store: Map<string, Entry<T>>, key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = store.get(key);
  if (hit && now - hit.at < OFFERS_LOOKUP_TTL_MS) return hit.value;
  if (store.size >= MAX_ENTRIES) store.clear();
  // Store the promise so parallel lists of the same driver share one call.
  const value = load().catch((e: unknown) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: now, value });
  return value;
}

const profiles = new Map<string, Entry<Awaited<ReturnType<typeof fetchDriverProfileSnapshot>>>>();
const debts = new Map<string, Entry<Awaited<ReturnType<typeof fetchDriverDebtStatus>>>>();

export function offersDriverProfile(driverUserId: string) {
  return cached(profiles, driverUserId, () => fetchDriverProfileSnapshot(driverUserId));
}

export function offersDriverDebtStatus(driverUserId: string) {
  return cached(debts, driverUserId, () => fetchDriverDebtStatus(driverUserId));
}

/** Tests only. */
export function __clearOffersLookupCache() {
  profiles.clear();
  debts.clear();
}
