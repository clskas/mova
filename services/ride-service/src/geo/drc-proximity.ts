import {
  findServiceAreaByCoords,
  findServiceAreaByName,
  isInDrcTerritory,
  RDC_MAP_CENTER,
} from '@mova/shared';

export type DrcProximity = { lat: number; lng: number };

/**
 * Biais Mapbox / Photon / Nominatim :
 * 1. GPS si le point est en RDC
 * 2. Centre de la ville SENGA choisie
 * 3. Centroïde carte RDC (jamais Kinshasa par défaut)
 */
export function resolveDrcProximity(opts?: {
  lat?: number;
  lng?: number;
  city?: string;
}): DrcProximity {
  if (opts?.lat != null && opts?.lng != null && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    if (isInDrcTerritory(opts.lat, opts.lng)) {
      return { lat: opts.lat, lng: opts.lng };
    }
    const nearest = findServiceAreaByCoords(opts.lat, opts.lng);
    if (nearest) return { lat: nearest.centerLat, lng: nearest.centerLng };
  }
  const city = opts?.city?.trim();
  if (city) {
    const area = findServiceAreaByName(city);
    if (area) return { lat: area.centerLat, lng: area.centerLng };
  }
  return { lat: RDC_MAP_CENTER.lat, lng: RDC_MAP_CENTER.lng };
}
