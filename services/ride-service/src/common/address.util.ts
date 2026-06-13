import {
  findServiceAreaByCoords,
  findServiceAreaByName,
  getServiceArea,
  isInServiceArea,
  MARKET_RDC,
  MovaErrorCode,
  MovaHttpException,
  serviceAreaOutOfBoundsMessage,
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
  for (const area of getCommunesForArea('kinshasa')) {
    if (lower.includes(area.name.toLowerCase())) return true;
  }
  return false;
}

/** @deprecated Alias — utiliser isServiceAreaAddress */
export function isKinshasaAddress(address: string): boolean {
  return isServiceAreaAddress(address);
}

export function assertServiceAreaCoords(lat: number, lng: number, areaId?: string): ServiceArea {
  if (areaId) {
    const area = getServiceArea(areaId);
    if (!area || !isInServiceArea(lat, lng, area)) {
      throw new MovaHttpException(
        MovaErrorCode.VALIDATION_ERROR,
        undefined,
        serviceAreaOutOfBoundsMessage(),
      );
    }
    return area;
  }
  const area = findServiceAreaByCoords(lat, lng);
  if (!area) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      serviceAreaOutOfBoundsMessage(),
    );
  }
  return area;
}

/** Destination dans une zone de service MOVA (adresse ou coords valides). */
export function assertServiceAreaDestination(
  address: string,
  coords?: { lat: number; lng: number },
  areaId?: string,
): ServiceArea {
  if (coords) {
    try {
      return assertServiceAreaCoords(coords.lat, coords.lng, areaId);
    } catch {
      /* fall through to address check */
    }
  }
  if (isServiceAreaAddress(address, areaId)) {
    const area = areaId ? getServiceArea(areaId) : findServiceAreaByName(address);
    if (area) return area;
    return getServiceArea(MARKET_RDC.defaultServiceAreaId)!;
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
export function addressToCoords(address: string, areaId = MARKET_RDC.defaultServiceAreaId): { lat: number; lng: number } {
  return addressToCoordsForArea(address, areaId);
}

export function addressToCoordsForArea(
  address: string,
  areaId = MARKET_RDC.defaultServiceAreaId,
): { lat: number; lng: number } {
  const area = getServiceArea(areaId) ?? getServiceArea(MARKET_RDC.defaultServiceAreaId)!;
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

export const DEFAULT_PICKUP = MARKET_RDC.defaultCoords;

export function assertSameServiceArea(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): ServiceArea {
  const pickupArea = assertServiceAreaCoords(pickupLat, pickupLng);
  const dropoffArea = assertServiceAreaCoords(dropoffLat, dropoffLng);
  if (pickupArea.id !== dropoffArea.id) {
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      undefined,
      `Le départ et la destination doivent être dans la même ville (${pickupArea.name}).`,
    );
  }
  return pickupArea;
}
