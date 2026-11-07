/**
 * Parcel delivery: which vehicle fits a parcel. The app proposes the recommended one and the
 * customer may pick another vehicle among the allowed ones (never one too small).
 */
import type { VehicleTypeValue } from './ride-contract';

export type ParcelVehicleType = 'MOTO_TAXI' | 'STANDARD' | 'TRIPOTEUR' | 'UTILITAIRE' | 'CAMION';

export const PARCEL_VEHICLE_LABELS: Record<ParcelVehicleType, string> = {
  MOTO_TAXI: 'Moto',
  STANDARD: 'Voiture',
  TRIPOTEUR: 'Tripoteur',
  UTILITAIRE: 'Camionnette',
  CAMION: 'Camion',
};

/** When no tariff is set for a goods vehicle: its price = car price × this factor. */
export const PARCEL_VEHICLE_FALLBACK_FACTOR: Record<ParcelVehicleType, number> = {
  MOTO_TAXI: 0.7,
  STANDARD: 1,
  TRIPOTEUR: 1.3,
  UTILITAIRE: 1.8,
  CAMION: 2.5,
};

/** Above these weights (kg) a bigger vehicle is recommended for a large parcel. */
export const PARCEL_VAN_FROM_KG = 100;
export const PARCEL_TRUCK_FROM_KG = 300;
export const PARCEL_MAX_KG = 3000;

export type ParcelVehicleOption = { vehicleType: ParcelVehicleType; recommended: boolean };

/**
 * Allowed vehicles for a parcel, the recommended one first.
 * - Documents / small: moto (recommended), car, tripoteur.
 * - Medium (1–5 kg): car (recommended), tripoteur, van.
 * - Large: tripoteur (recommended), car, van, truck — a van from 100 kg, a truck from 300 kg.
 */
export function parcelVehicleOptions(
  weightCategory: string | null | undefined,
  weightKg?: number | null,
): ParcelVehicleOption[] {
  const cat = String(weightCategory ?? 'SMALL').toUpperCase();
  const kg = Number(weightKg ?? 0);
  let ordered: ParcelVehicleType[];
  if (cat === 'DOCUMENTS' || cat === 'SMALL') {
    ordered = ['MOTO_TAXI', 'STANDARD', 'TRIPOTEUR'];
  } else if (cat === 'MEDIUM') {
    ordered = ['STANDARD', 'TRIPOTEUR', 'UTILITAIRE'];
  } else if (kg >= PARCEL_TRUCK_FROM_KG) {
    ordered = ['CAMION', 'UTILITAIRE'];
  } else if (kg >= PARCEL_VAN_FROM_KG) {
    ordered = ['UTILITAIRE', 'TRIPOTEUR', 'CAMION'];
  } else {
    ordered = ['TRIPOTEUR', 'STANDARD', 'UTILITAIRE', 'CAMION'];
  }
  return ordered.map((vehicleType, i) => ({ vehicleType, recommended: i === 0 }));
}

export function recommendedParcelVehicle(weightCategory: string | null | undefined, weightKg?: number | null): ParcelVehicleType {
  return parcelVehicleOptions(weightCategory, weightKg)[0].vehicleType;
}

export function isParcelVehicleAllowed(
  vehicleType: string | null | undefined,
  weightCategory: string | null | undefined,
  weightKg?: number | null,
): boolean {
  return parcelVehicleOptions(weightCategory, weightKg).some((o) => o.vehicleType === vehicleType);
}

/** Driver vehicles that may take a parcel booked for `requested` (a Familiale counts as a car). */
export function driverFitsParcelVehicle(driverVehicleTypes: VehicleTypeValue[], requested: string | null | undefined): boolean {
  if (!requested) return true;
  if (requested === 'STANDARD') return driverVehicleTypes.some((t) => t === 'STANDARD' || t === 'FAMILIALE' || t === 'COMFORT' || t === 'VIP');
  return driverVehicleTypes.includes(requested as VehicleTypeValue);
}
