import { MOVA_CITIES } from "@/lib/api";

const STORAGE_KEY = "senga_admin_tarifs_city";

/** Centres approx. des villes SENGA (pour défaut géoloc / tarifs). */
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Kinshasa: { lat: -4.325, lng: 15.322 },
  Lubumbashi: { lat: -11.6647, lng: 27.4794 },
  Goma: { lat: -1.6785, lng: 29.2228 },
  Bukavu: { lat: -2.4908, lng: 28.8428 },
  Kisangani: { lat: 0.5153, lng: 25.191 },
  "Mbuji-Mayi": { lat: -6.136, lng: 23.5898 },
  Kananga: { lat: -5.896, lng: 22.416 },
  Matadi: { lat: -5.816, lng: 13.45 },
  Boma: { lat: -5.851, lng: 13.054 },
  Kolwezi: { lat: -10.7147, lng: 25.4667 },
  Likasi: { lat: -10.983, lng: 26.733 },
  Tshikapa: { lat: -6.416, lng: 20.8 },
  Mbandaka: { lat: 0.0486, lng: 18.2603 },
  Kindu: { lat: -2.95, lng: 25.95 },
  Bunia: { lat: 1.5605, lng: 30.2522 },
  Butembo: { lat: 0.1415, lng: 29.2917 },
  Beni: { lat: 0.491, lng: 29.473 },
  Uvira: { lat: -3.4067, lng: 29.1458 },
  Kalemie: { lat: -5.9475, lng: 29.1947 },
  Kamina: { lat: -8.7386, lng: 24.9906 },
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function nearestMovaCity(lat: number, lng: number): string {
  let best: string = MOVA_CITIES[0];
  let bestKm = Number.POSITIVE_INFINITY;
  for (const name of MOVA_CITIES) {
    const c = CITY_CENTERS[name];
    if (!c) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = name;
    }
  }
  return best;
}

export function readStoredTarifsCity(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (v && (MOVA_CITIES as readonly string[]).includes(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function storeTarifsCity(city: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, city);
  } catch {
    /* ignore */
  }
}

/** Ville initiale : périmètre CITY_ADMIN > mémoire locale > Kinshasa (géoloc ensuite). */
export function initialTarifsCity(lockedCity: string | null | undefined): string {
  if (lockedCity?.trim()) return lockedCity.trim();
  return readStoredTarifsCity() ?? MOVA_CITIES[0];
}

export function detectTarifsCityFromGps(): Promise<string | null> {
  if (typeof window === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(nearestMovaCity(pos.coords.latitude, pos.coords.longitude)),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  });
}
