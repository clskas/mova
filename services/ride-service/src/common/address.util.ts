import { isKinshasaCoords, KINSHASA_COMMUNES, MARKET_RDC, MovaErrorCode, MovaHttpException } from '@mova/shared';

const COMMUNE_NAMES = KINSHASA_COMMUNES.map((c) => c.name.toLowerCase());

export function isKinshasaAddress(address: string): boolean {
  const lower = address.trim().toLowerCase();
  if (!lower) return false;
  if (lower.includes('kinshasa')) return true;
  return COMMUNE_NAMES.some((name) => lower.includes(name));
}

/** Destination dans la zone de service Kinshasa (adresse ou coords valides). */
export function assertKinshasaDestination(
  address: string,
  coords?: { lat: number; lng: number },
): void {
  if (coords && isKinshasaCoords(coords.lat, coords.lng)) return;
  if (isKinshasaAddress(address)) return;
  throw new MovaHttpException(
    MovaErrorCode.VALIDATION_ERROR,
    undefined,
    'MOVA ne couvre que Kinshasa. Choisissez une destination dans une commune de Kinshasa.',
  );
}

/** Stub géocodage Kinshasa — dérive des coords à partir de l'adresse texte. */
export function addressToCoords(address: string): { lat: number; lng: number } {
  const base = MARKET_RDC.defaultCoords;
  let hash = 0;
  for (const c of address) hash = (hash + c.charCodeAt(0)) % 1000;
  return {
    lat: base.lat - 0.01 - (hash % 50) / 10000,
    lng: base.lng + 0.01 + (Math.floor(hash / 50) % 50) / 10000,
  };
}

export const DEFAULT_PICKUP = MARKET_RDC.defaultCoords;
