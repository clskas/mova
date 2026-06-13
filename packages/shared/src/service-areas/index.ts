import { KINSHASA_COMMUNES } from '../communes-seed';
import {
  DEFAULT_SERVICE_AREA_ID,
  DRC_SERVICE_AREAS,
  KINSHASA_BOUNDS,
  type ServiceArea,
  type ServiceAreaBounds,
  type ServiceAreaDistrict,
} from './drc-service-areas';

export {
  DEFAULT_SERVICE_AREA_ID,
  DRC_SERVICE_AREAS,
  KINSHASA_BOUNDS,
  type ServiceArea,
  type ServiceAreaBounds,
  type ServiceAreaDistrict,
};

const AREAS_BY_ID = new Map(DRC_SERVICE_AREAS.map((a) => [a.id, a]));
const AREAS_BY_NAME = new Map(DRC_SERVICE_AREAS.map((a) => [a.name.toLowerCase(), a]));

export function getServiceArea(id: string): ServiceArea | undefined {
  return AREAS_BY_ID.get(id);
}

export function getActiveServiceAreas(): ServiceArea[] {
  return DRC_SERVICE_AREAS.filter((a) => a.active);
}

export function isInServiceArea(
  lat: number,
  lng: number,
  areaIdOrArea?: string | ServiceArea,
): boolean {
  if (areaIdOrArea) {
    const area = typeof areaIdOrArea === 'string' ? getServiceArea(areaIdOrArea) : areaIdOrArea;
    if (!area || !area.active) return false;
    const b = area.bounds;
    return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
  }
  return findServiceAreaByCoords(lat, lng) != null;
}

/** @deprecated Utiliser isInServiceArea — conservé pour compatibilité. */
export function isKinshasaCoords(lat: number, lng: number): boolean {
  return isInServiceArea(lat, lng);
}

export function findServiceAreaByCoords(lat: number, lng: number): ServiceArea | null {
  for (const area of DRC_SERVICE_AREAS) {
    if (!area.active) continue;
    const b = area.bounds;
    if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
      return area;
    }
  }
  return null;
}

export function findServiceAreaByName(name: string): ServiceArea | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const direct = AREAS_BY_NAME.get(normalized);
  if (direct) return direct;
  for (const area of DRC_SERVICE_AREAS) {
    if (normalized.includes(area.name.toLowerCase())) return area;
  }
  return null;
}

export function findNearestServiceArea(lat: number, lng: number): ServiceArea {
  let best = DRC_SERVICE_AREAS[0];
  let bestDist = Infinity;
  for (const area of DRC_SERVICE_AREAS) {
    if (!area.active) continue;
    const d = (area.centerLat - lat) ** 2 + (area.centerLng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = area;
    }
  }
  return best;
}

export function getCommunesForArea(areaId: string): ServiceAreaDistrict[] {
  const area = getServiceArea(areaId);
  if (!area) return [];
  if (areaId === 'kinshasa') {
    return KINSHASA_COMMUNES.map((c) => ({ name: c.name, lat: c.lat, lng: c.lng }));
  }
  return area.districts ?? [{ name: 'Centre-ville', lat: area.centerLat, lng: area.centerLng }];
}

export function formatServiceAreasList(max = 8): string {
  const names = getActiveServiceAreas().map((a) => a.name);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')}… (+${names.length - max} villes)`;
}

export function serviceAreaOutOfBoundsMessage(): string {
  return `MOVA couvre ${formatServiceAreasList()}. Choisissez une adresse dans une ville desservie.`;
}
