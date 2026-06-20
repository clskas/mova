import {
  DRC_SERVICE_AREAS,
  findServiceAreaByCoords,
  findServiceAreaByName,
  fallbackServiceArea,
  getServiceArea,
  isInDrcTerritory,
  isInServiceArea,
  MARKET_RDC,
  MovaErrorCode,
  MovaHttpException,
  rdcTerritoryOutOfBoundsMessage,
  serviceAreaOutOfBoundsMessage,
  resolveServiceAreaForCoords,
  getCommunesForArea,
  type ServiceArea,
} from '@mova/shared';

function districtNamesForArea(area: ServiceArea): string[] {
  return getCommunesForArea(area.id).map((d) => d.name.toLowerCase());
}

export function isServiceAreaAddress(address: string, areaId?: string): boolean {
  const lower = address.trim().toLowerCase();
  if (!lower) return false;
  if (areaId) {
    const area = getServiceArea(areaId);
    if (!area) return false;
    if (lower.includes(area.name.toLowerCase())) return true;
    return districtNamesForArea(area).some((name) => lower.includes(name));
  }
  if (findServiceAreaByName(address)) return true;
  for (const area of DRC_SERVICE_AREAS) {
    for (const district of getCommunesForArea(area.id)) {
      if (lower.includes(district.name.toLowerCase())) return true;
    }
  }
  return false;
}

/** @deprecated Alias — utiliser isServiceAreaAddress */
export function isKinshasaAddress(address: string): boolean {
  return isServiceAreaAddress(address);
}

export function assertServiceAreaCoords(lat: number, lng: number, _areaId?: string): ServiceArea {
  if (!isInDrcTerritory(lat, lng)) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      rdcTerritoryOutOfBoundsMessage(),
    );
  }
  return resolveServiceAreaForCoords(lat, lng);
}

/** Destination valide si coords en RDC ou adresse renseignée (couverture nationale). */
export function assertServiceAreaDestination(
  address: string,
  coords?: { lat: number; lng: number },
  areaId?: string,
): ServiceArea {
  if (coords) {
    return assertServiceAreaCoords(coords.lat, coords.lng, areaId);
  }
  const trimmed = address.trim();
  if (trimmed.length >= 3) {
    return areaId ? (getServiceArea(areaId) ?? fallbackServiceArea()) : fallbackServiceArea();
  }
  throw new MovaHttpException(
    MovaErrorCode.VALIDATION_ERROR,
    undefined,
    serviceAreaOutOfBoundsMessage(),
  );
}

/** @deprecated Alias — utiliser assertServiceAreaDestination */
export function assertKinshasaDestination(
  address: string,
  coords?: { lat: number; lng: number },
): void {
  assertServiceAreaDestination(address, coords);
}

/** Stub géocodage — dérive des coords à partir de l'adresse texte et de la zone. */
export function addressToCoords(address: string, areaId?: string): { lat: number; lng: number } {
  return addressToCoordsForArea(address, areaId ?? fallbackServiceArea().id);
}

export function addressToCoordsForArea(
  address: string,
  areaId?: string,
): { lat: number; lng: number } {
  const area = getServiceArea(areaId ?? '') ?? fallbackServiceArea();
  const lower = address.toLowerCase();
  for (const district of getCommunesForArea(area.id)) {
    if (lower.includes(district.name.toLowerCase())) {
      return { lat: district.lat, lng: district.lng };
    }
  }
  if (lower.includes(area.name.toLowerCase())) {
    return { lat: area.centerLat, lng: area.centerLng };
  }
  let hash = 0;
  for (const c of address) hash = (hash + c.charCodeAt(0)) % 1000;
  return {
    lat: area.centerLat - 0.01 - (hash % 50) / 10000,
    lng: area.centerLng + 0.01 + (Math.floor(hash / 50) % 50) / 10000,
  };
}

export const DEFAULT_PICKUP = MARKET_RDC.mapCenter;

export type ServiceAreaPair = {
  pickupArea: ServiceArea;
  dropoffArea: ServiceArea;
  isInterCity: boolean;
};

/** Valide départ et destination dans des zones MOVA (même ville ou inter-villes RDC). */
export function assertServiceAreaPair(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): ServiceAreaPair {
  const pickupArea = assertServiceAreaCoords(pickupLat, pickupLng);
  const dropoffArea = assertServiceAreaCoords(dropoffLat, dropoffLng);
  return {
    pickupArea,
    dropoffArea,
    isInterCity: pickupArea.id !== dropoffArea.id,
  };
}

/** @deprecated Alias — utiliser assertServiceAreaPair */
export function assertSameServiceArea(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): ServiceArea {
  return assertServiceAreaPair(pickupLat, pickupLng, dropoffLat, dropoffLng).pickupArea;
}

export function interCitySurchargeCdf(distanceKm: number): number {
  const { baseSurchargeCdf, perKmSurchargeCdf } = MARKET_RDC.interCity;
  return Math.ceil(baseSurchargeCdf + distanceKm * perKmSurchargeCdf);
}
