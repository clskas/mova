/** Emprise approximative du territoire RDC — couverture nationale SENGA (hors boîtes urbaines). */
export const RDC_TERRITORY_BOUNDS = {
  minLat: -13.6,
  maxLat: 5.6,
  minLng: 12.0,
  maxLng: 31.5,
} as const;

export function isInDrcTerritory(lat: number, lng: number): boolean {
  const b = RDC_TERRITORY_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function rdcTerritoryOutOfBoundsMessage(): string {
  return 'Cette position est hors du territoire de la République Démocratique du Congo.';
}
