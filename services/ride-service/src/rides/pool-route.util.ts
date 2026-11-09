/** Pool (shared ride) route helpers — pure, no I/O. */

export type PoolPoint = { lat: number; lng: number };

export type PoolStop = {
  type: 'pickup' | 'dropoff';
  bookingId: string;
  userId: string;
  lat: number;
  lng: number;
  address: string | null;
};

type PoolBooking = {
  id: string;
  userId: string;
  status: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress: string | null;
  pickedUpAt?: Date | null;
  droppedOffAt?: Date | null;
};

export function straightKm(a: PoolPoint, b: PoolPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Where the driver probably is: the last pickup / drop-off done, else the ride's start.
 * (Used when the live GPS position is not at hand.)
 */
export function lastPoolPosition(
  ride: { pickupLat: number; pickupLng: number },
  bookings: PoolBooking[],
): PoolPoint {
  let best: { at: number; p: PoolPoint } | null = null;
  for (const b of bookings) {
    if (b.droppedOffAt) {
      const at = new Date(b.droppedOffAt).getTime();
      if (!best || at > best.at) best = { at, p: { lat: b.dropoffLat, lng: b.dropoffLng } };
    }
    if (b.pickedUpAt) {
      const at = new Date(b.pickedUpAt).getTime();
      if (!best || at > best.at) best = { at, p: { lat: b.pickupLat, lng: b.pickupLng } };
    }
  }
  return best?.p ?? { lat: ride.pickupLat, lng: ride.pickupLng };
}

/**
 * Remaining stops in driving order: always the nearest possible next stop, a passenger's
 * drop-off only after their pickup. (It used to be every pickup first, then every drop-off,
 * in booking order — the driver zig-zagged across town.)
 */
export function orderPoolStops(start: PoolPoint, bookings: PoolBooking[]): PoolStop[] {
  const pickups = new Map<string, PoolStop>();
  const dropoffs = new Map<string, PoolStop>();
  for (const b of bookings) {
    const dropoff: PoolStop = {
      type: 'dropoff',
      bookingId: b.id,
      userId: b.userId,
      lat: b.dropoffLat,
      lng: b.dropoffLng,
      address: b.dropoffAddress,
    };
    if (b.status === 'WAITING') {
      pickups.set(b.id, {
        type: 'pickup',
        bookingId: b.id,
        userId: b.userId,
        lat: b.pickupLat,
        lng: b.pickupLng,
        address: b.pickupAddress,
      });
      dropoffs.set(b.id, dropoff);
    } else if (b.status === 'PICKED_UP') {
      dropoffs.set(b.id, dropoff);
    }
  }
  const order: PoolStop[] = [];
  let here = start;
  while (pickups.size > 0 || dropoffs.size > 0) {
    const candidates = [
      ...pickups.values(),
      ...[...dropoffs.values()].filter((d) => !pickups.has(d.bookingId)),
    ];
    let next = candidates[0]!;
    let bestKm = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const km = straightKm(here, c);
      if (km < bestKm) {
        bestKm = km;
        next = c;
      }
    }
    order.push(next);
    if (next.type === 'pickup') pickups.delete(next.bookingId);
    else dropoffs.delete(next.bookingId);
    here = next;
  }
  return order;
}

/**
 * Extra distance a new pickup adds for the passengers already on board: going from the
 * driver to the new pickup and on to the next on-board drop-off, instead of straight there.
 */
export function onboardDetourKm(position: PoolPoint, newPickup: PoolPoint, nextOnboardDropoff: PoolPoint): number {
  return (
    straightKm(position, newPickup) + straightKm(newPickup, nextOnboardDropoff) - straightKm(position, nextOnboardDropoff)
  );
}
