/** Alias UI / contrat mobile → enum Prisma ride-service. */
const ALIASES: Record<string, string> = {
  MOTO: "MOTO_TAXI",
  MOTO_TAXI: "MOTO_TAXI",
  "MOTO-TAXI": "MOTO_TAXI",
  BIKE: "MOTO_TAXI",
  MOTORCYCLE: "MOTO_TAXI",
  STANDARD: "STANDARD",
  TAXI: "STANDARD",
  CAR: "STANDARD",
  BERLINE: "STANDARD",
  CONFORT: "COMFORT",
  COMFORT: "COMFORT",
  VIP: "VIP",
};

export const VEHICLE_CATEGORIES = [
  { id: "MOTO", label: "Moto", icon: "🏍️" },
  { id: "TAXI", label: "Taxi", icon: "🚗" },
] as const;

export const VEHICLE_TYPES = [
  { id: "MOTO_TAXI", label: "Moto-taxi", icon: "🏍️", category: "MOTO" },
  { id: "STANDARD", label: "Standard", icon: "🚗", category: "TAXI" },
  { id: "COMFORT", label: "Confort", icon: "✨", category: "TAXI" },
  { id: "VIP", label: "VIP", icon: "👑", category: "TAXI" },
] as const;

export function normalizeVehicleType(input: string | undefined | null): string {
  const key = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (!key) return "STANDARD";
  return ALIASES[key] ?? ALIASES[key.replace(/-/g, "_")] ?? key;
}

export function vehicleCategory(type: string | undefined | null): "MOTO" | "TAXI" {
  return normalizeVehicleType(type) === "MOTO_TAXI" ? "MOTO" : "TAXI";
}

export function defaultTypeForCategory(category: string): string {
  return category.toUpperCase() === "MOTO" ? "MOTO_TAXI" : "STANDARD";
}

export function vehicleTypesForCategory(category: string) {
  return VEHICLE_TYPES.filter((v) => v.category === (category.toUpperCase() === "MOTO" ? "MOTO" : "TAXI"));
}
