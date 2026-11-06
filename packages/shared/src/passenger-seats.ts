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

/** Largest group a passenger can request in one car ride. */
export const MAX_RIDE_PASSENGER_COUNT = 8;

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
  return Math.min(Math.floor(n), MAX_RIDE_PASSENGER_COUNT);
}

/** True when the vehicle can carry the group. */
export function vehicleFitsPassengers(
  vehicle: { type: string; passengerSeats?: number | null },
  passengerCount: number,
): boolean {
  return vehiclePassengerSeats(vehicle.type, vehicle.passengerSeats) >= Math.max(1, passengerCount);
}
