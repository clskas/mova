import type { AdminDriver } from "./api";

const CARGO_VEHICLE_TYPES = new Set(["STANDARD", "COMFORT", "VIP", "FAMILIALE", "UTILITAIRE", "CAMION"]);

function activeVehicleTypes(driver: AdminDriver): string[] {
  return (driver.vehicles ?? [])
    .filter((v) => v.isActive !== false)
    .map((v) => (v.type ?? "").toUpperCase())
    .filter(Boolean);
}

/** Exclut les chauffeurs moto-only (déménagement, gros colis). */
export function driverHasCargoVehicle(driver: AdminDriver): boolean {
  return activeVehicleTypes(driver).some((t) => CARGO_VEHICLE_TYPES.has(t));
}

/** Même règle que le serveur (@mova/shared MOVING_ELIGIBLE_VEHICLE_TYPES). */
const MOVING_VEHICLE_TYPES: Record<string, readonly string[]> = {
  CAMIONNETTE: ["UTILITAIRE", "CAMION"],
  CAMION_15M3: ["UTILITAIRE", "CAMION"],
  CAMION_30M3: ["CAMION"],
  CAMION_50M3: ["CAMION"],
};

/**
 * Chauffeurs dont un véhicule actif convient : bon type et, si le volume utile
 * est déclaré, assez grand pour le déménagement (non déclaré = à vérifier à la main).
 */
export function filterDriversForMoving(
  drivers: AdminDriver[],
  vehicleCategory?: string | null,
  volumeM3?: number | null,
): AdminDriver[] {
  const allowed = MOVING_VEHICLE_TYPES[vehicleCategory ?? ""] ?? MOVING_VEHICLE_TYPES.CAMION_15M3;
  const needed = volumeM3 != null && volumeM3 > 0 ? Math.ceil(volumeM3) : null;
  return drivers.filter((d) =>
    (d.vehicles ?? []).some((v) => {
      if (v.isActive === false || !allowed.includes((v.type ?? "").toUpperCase())) return false;
      return needed == null || v.cargoVolumeM3 == null || v.cargoVolumeM3 >= needed;
    }),
  );
}

/** Chauffeurs éligibles pour logistique location SENGA (livraison/récupération véhicule). */
export function filterDriversForRentalLogistics(drivers: AdminDriver[]): AdminDriver[] {
  return drivers.filter((d) => driverHasCargoVehicle(d));
}

/** Filtre colis/livraisons selon le poids (MEDIUM/LARGE → voiture). */
export function filterDriversForParcel(
  drivers: AdminDriver[],
  weightCategory?: string | null,
): AdminDriver[] {
  const cat = (weightCategory ?? "SMALL").toUpperCase();
  if (cat !== "MEDIUM" && cat !== "LARGE") return drivers;
  return drivers.filter((d) => driverHasCargoVehicle(d));
}

/** Ordre assignation : dispo → en course → hors ligne. */
export function sortDriversByDuty(drivers: AdminDriver[]): AdminDriver[] {
  const rank = (d: AdminDriver) => {
    if (d.dutyStatus === "AVAILABLE" || (d.isAvailable && d.dutyStatus !== "ON_TRIP" && d.dutyStatus !== "OFFLINE"))
      return 0;
    if (d.dutyStatus === "ON_TRIP") return 1;
    return 2;
  };
  return [...drivers].sort((a, b) => rank(a) - rank(b));
}

/** Filtre selon le type de course planifiée (MOTO_TAXI, STANDARD, COMFORT, VIP). */
export function filterDriversForRideVehicle(
  drivers: AdminDriver[],
  vehicleType?: string | null,
): AdminDriver[] {
  if (!vehicleType) return drivers;
  const rideType = vehicleType.toUpperCase();
  return drivers.filter((d) => {
    const types = activeVehicleTypes(d);
    if (rideType === "MOTO_TAXI" || rideType === "MOTO") {
      return types.includes("MOTO_TAXI");
    }
    if (rideType === "STANDARD") {
      return types.some((t) => CARGO_VEHICLE_TYPES.has(t));
    }
    if (rideType === "COMFORT" || rideType === "CONFORT") {
      return types.some((t) => t === "COMFORT" || t === "VIP");
    }
    if (rideType === "VIP") {
      return types.includes("VIP");
    }
    if (rideType === "FAMILIALE") {
      return types.includes("FAMILIALE");
    }
    return true;
  });
}
