/** Vitesse moyenne urbaine Kinshasa (km/h) pour estimation ETA chauffeur → point. */
export const URBAN_SPEED_KMH = 25;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function etaMinutesFromDistanceKm(distanceKm: number): number {
  return Math.max(1, Math.ceil((distanceKm / URBAN_SPEED_KMH) * 60));
}

export function computeDriverEta(
  driverLat: number,
  driverLng: number,
  targetLat: number,
  targetLng: number,
): { driverDistanceKm: number; etaMinutes: number } {
  const driverDistanceKm = Math.round(haversineKm(driverLat, driverLng, targetLat, targetLng) * 100) / 100;
  return { driverDistanceKm, etaMinutes: etaMinutesFromDistanceKm(driverDistanceKm) };
}
