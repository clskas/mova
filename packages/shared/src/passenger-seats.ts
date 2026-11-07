import { normalizeVehicleType, VehicleTypeValue } from './ride-contract';

/**
 * Passenger seats (driver excluded). A vehicle without a declared value uses
 * its category default, so drivers who never filled it keep receiving rides.
 */
export const DEFAULT_VEHICLE_PASSENGER_SEATS: Record<VehicleTypeValue, number> = {
  MOTO_TAXI: 1,
  STANDARD: 4,
  COMFORT: 4,
  VIP: 4,
  FAMILIALE: 6,
  UTILITAIRE: 2,
  CAMION: 2,
  TRICYCLE: 3,
  TRIPOTEUR: 1,
};

/** Upper bound a driver may declare (minibus-style cars are registered as STANDARD). */
export const MAX_VEHICLE_PASSENGER_SEATS: Record<VehicleTypeValue, number> = {
  MOTO_TAXI: 1,
  STANDARD: 8,
  COMFORT: 8,
  VIP: 8,
  FAMILIALE: 8,
  UTILITAIRE: 8,
  CAMION: 2,
  TRICYCLE: 3,
  TRIPOTEUR: 1,
};

/** Smallest declaration accepted (a Familiale vehicle carries at least 5). */
export const MIN_VEHICLE_PASSENGER_SEATS: Partial<Record<VehicleTypeValue, number>> = {
  FAMILIALE: 5,
};

/** Largest group a passenger can request in one car ride (default; see [maxRidePassengerCount]). */
export const MAX_RIDE_PASSENGER_COUNT = 8;
let maxRidePassengers = MAX_RIDE_PASSENGER_COUNT;

/** Largest group a passenger can request now (the Familiale maximum set in the admin). */
export function maxRidePassengerCount(): number {
  return maxRidePassengers;
}

/** Seat limits the admins can change (Admin → Services SENGA → Nombre de places). */
export type SeatLimits = {
  /** Largest group in a Standard / Confort / VIP car (above it the app switches to Familiale). */
  carMaxPassengers: number;
  /** A Familiale vehicle carries at least / at most this many passengers. */
  familialeMinSeats: number;
  familialeMaxSeats: number;
  /** Passenger tricycle ("kéké"): largest number of passengers. */
  tricycleMaxSeats: number;
};

export const DEFAULT_SEAT_LIMITS: SeatLimits = {
  carMaxPassengers: 4,
  familialeMinSeats: 5,
  familialeMaxSeats: 8,
  tricycleMaxSeats: 3,
};

/** Keeps values in sensible ranges and coherent with each other. */
export function normalizeSeatLimits(raw: unknown, fallback: SeatLimits = DEFAULT_SEAT_LIMITS): SeatLimits {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const int = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return typeof n === 'number' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const carMaxPassengers = int(o.carMaxPassengers, fallback.carMaxPassengers, 1, 8);
  const familialeMaxSeats = int(o.familialeMaxSeats, fallback.familialeMaxSeats, 5, 20);
  const familialeMinSeats = Math.min(int(o.familialeMinSeats, fallback.familialeMinSeats, 2, 20), familialeMaxSeats);
  const tricycleMaxSeats = int(o.tricycleMaxSeats, fallback.tricycleMaxSeats, 1, 10);
  return { carMaxPassengers, familialeMinSeats, familialeMaxSeats, tricycleMaxSeats };
}

/**
 * Applies the admin seat limits to this process (declarations, matching, ride requests).
 * Called by the services when the platform config loads or changes.
 */
export function applySeatLimits(raw: unknown) {
  const l = normalizeSeatLimits(raw);
  for (const t of ['STANDARD', 'COMFORT', 'VIP'] as const) RIDE_PASSENGER_LIMIT_BY_TYPE[t] = l.carMaxPassengers;
  MIN_VEHICLE_PASSENGER_SEATS.FAMILIALE = l.familialeMinSeats;
  MAX_VEHICLE_PASSENGER_SEATS.FAMILIALE = l.familialeMaxSeats;
  RIDE_PASSENGER_LIMIT_BY_TYPE.FAMILIALE = l.familialeMaxSeats;
  DEFAULT_VEHICLE_PASSENGER_SEATS.FAMILIALE = Math.max(l.familialeMinSeats, Math.min(6, l.familialeMaxSeats));
  MAX_VEHICLE_PASSENGER_SEATS.TRICYCLE = l.tricycleMaxSeats;
  RIDE_PASSENGER_LIMIT_BY_TYPE.TRICYCLE = l.tricycleMaxSeats;
  DEFAULT_VEHICLE_PASSENGER_SEATS.TRICYCLE = Math.min(3, l.tricycleMaxSeats);
  // Cars other than Familiale may still declare up to the largest group (minibus-style cars).
  const carDeclareMax = Math.max(8, l.familialeMaxSeats);
  for (const t of ['STANDARD', 'COMFORT', 'VIP', 'UTILITAIRE'] as const) MAX_VEHICLE_PASSENGER_SEATS[t] = carDeclareMax;
  maxRidePassengers = Math.max(l.familialeMaxSeats, l.carMaxPassengers, l.tricycleMaxSeats);
}

/**
 * Largest group the passenger app offers per gamme. Standard / Confort / VIP are
 * 4-seat cars; 5+ passengers go to Familiale. (The API still accepts up to 8 on
 * any car for older apps, matched against declared seats.)
 */
export const RIDE_PASSENGER_LIMIT_BY_TYPE: Partial<Record<VehicleTypeValue, number>> = {
  MOTO_TAXI: 1,
  STANDARD: 4,
  COMFORT: 4,
  VIP: 4,
  FAMILIALE: 8,
  TRICYCLE: 3,
};

function typeOrNull(type: string | null | undefined): VehicleTypeValue | null {
  try {
    return normalizeVehicleType(String(type ?? ''));
  } catch {
    return null;
  }
}

/** Seats a vehicle really offers: declared value if valid, else the category default. */
export function vehiclePassengerSeats(type: string | null | undefined, declared?: number | null): number {
  const t = typeOrNull(type);
  if (!t) return 1;
  const max = MAX_VEHICLE_PASSENGER_SEATS[t];
  if (declared != null && Number.isFinite(declared) && declared >= 1) {
    return Math.min(Math.floor(declared), max);
  }
  return DEFAULT_VEHICLE_PASSENGER_SEATS[t];
}

/** Validate a driver/admin declaration; returns null when out of range. */
export function normalizeDeclaredSeats(type: string | null | undefined, value: unknown): number | null {
  const t = typeOrNull(type);
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (!t || typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < (MIN_VEHICLE_PASSENGER_SEATS[t] ?? 1) || n > MAX_VEHICLE_PASSENGER_SEATS[t]) return null;
  return n;
}

/** Passenger count for a ride request: moto = 1, car = 1..MAX, missing/invalid = 1. */
export function normalizeRidePassengerCount(rideType: string | null | undefined, value: unknown): number {
  const t = typeOrNull(rideType);
  if (t === 'MOTO_TAXI') return 1;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), maxRidePassengers);
}

/** True when the vehicle can carry the group. */
export function vehicleFitsPassengers(
  vehicle: { type: string; passengerSeats?: number | null },
  passengerCount: number,
): boolean {
  return vehiclePassengerSeats(vehicle.type, vehicle.passengerSeats) >= Math.max(1, passengerCount);
}

let seatRefreshTimer: NodeJS.Timeout | undefined;

/**
 * Services that validate seats without owning the platform config (driver-service) reload the
 * admin seat limits from ride-service every few minutes. Safe to call once at startup.
 */
export function startSeatLimitsRefresh(everyMs = 5 * 60_000) {
  if (seatRefreshTimer) return;
  const refresh = async () => {
    try {
      // Lazy import keeps this module free of service-url dependencies for the apps' tests.
      const { INTERNAL_API_KEY, serviceUrl } = await import('./service-urls');
      const res = await fetch(serviceUrl('ride', '/internal/client-apps-config'), {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { seatLimits?: unknown };
      applySeatLimits(data.seatLimits);
    } catch {
      /* keep the current limits */
    }
  };
  setTimeout(() => void refresh(), 5_000).unref?.();
  seatRefreshTimer = setInterval(() => void refresh(), everyMs);
  seatRefreshTimer.unref?.();
}
