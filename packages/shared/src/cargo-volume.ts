import { MOVING_ELIGIBLE_VEHICLE_TYPES, MovingVehicleCategoryValue, normalizeVehicleType, VehicleTypeValue } from './ride-contract';

/**
 * Volume utile (m³) of a utilitaire or camion, declared by the driver and
 * checked by the admin. Used to offer a move only to vehicles big enough.
 */
export const CARGO_VOLUME_RANGE_M3: Partial<Record<VehicleTypeValue, { min: number; max: number }>> = {
  UTILITAIRE: { min: 1, max: 25 },
  CAMION: { min: 5, max: 100 },
};

function typeOrNull(type: string | null | undefined): VehicleTypeValue | null {
  try {
    return normalizeVehicleType(String(type ?? ''));
  } catch {
    return null;
  }
}

/** True for the vehicle types that carry a declared cargo volume. */
export function vehicleHasCargoVolume(type: string | null | undefined): boolean {
  const t = typeOrNull(type);
  return t != null && CARGO_VOLUME_RANGE_M3[t] != null;
}

/** Validate a driver/admin declaration; returns null when out of range or not a cargo vehicle. */
export function normalizeDeclaredCargoVolume(type: string | null | undefined, value: unknown): number | null {
  const t = typeOrNull(type);
  const range = t ? CARGO_VOLUME_RANGE_M3[t] : undefined;
  const n = typeof value === 'string' ? Number(value) : (value as number);
  if (!range || typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < range.min || n > range.max) return null;
  return n;
}

export type MovingVehicleSnapshot = {
  type: string;
  isActive?: boolean;
  cargoVolumeM3?: number | null;
};

/**
 * A vehicle can take a move when its type suits the requested vehicle and,
 * if its volume is declared, the goods fit. An undeclared volume is accepted
 * (the admin checks it by hand) so drivers registered before the field keep working.
 */
export function vehicleFitsMove(
  vehicle: MovingVehicleSnapshot,
  category: MovingVehicleCategoryValue | string,
  volumeM3?: number | null,
): boolean {
  if (vehicle.isActive === false) return false;
  const t = typeOrNull(vehicle.type);
  if (!t) return false;
  const allowed =
    MOVING_ELIGIBLE_VEHICLE_TYPES[category as MovingVehicleCategoryValue] ?? MOVING_ELIGIBLE_VEHICLE_TYPES.CAMION_15M3;
  if (!allowed.includes(t)) return false;
  if (vehicle.cargoVolumeM3 == null || volumeM3 == null || !(volumeM3 > 0)) return true;
  return vehicle.cargoVolumeM3 >= Math.ceil(volumeM3);
}
