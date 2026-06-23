import type { AdminDriver } from "./api";

const CARGO_VEHICLE_TYPES = new Set(["STANDARD", "COMFORT", "VIP"]);

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

export function filterDriversForMoving(
  drivers: AdminDriver[],
  vehicleCategory?: string | null,
): AdminDriver[] {
  return drivers.filter((d) => {
    if (!driverHasCargoVehicle(d)) return false;
    const types = activeVehicleTypes(d);
    if (vehicleCategory === "CAMION_30M3" || vehicleCategory === "CAMION_50M3") {
      return types.some((t) => t === "COMFORT" || t === "VIP" || t === "STANDARD");
    }
    return true;
  });
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
    return true;
  });
}
