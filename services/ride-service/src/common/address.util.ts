import { MARKET_RDC } from '@mova/shared';

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
