export type AutocompleteSource = 'commune' | 'nominatim' | 'photon' | 'mapbox' | 'poi';

export type AutocompleteResult = {
  source: AutocompleteSource;
  label: string;
  address: string;
  lat: number;
  lng: number;
  commune: string | null;
  city: string;
  category?: string;
  poiId?: string;
  /** `USER` = catalogue informal SENGA (noms locaux / pins). */
  catalogSource?: string;
};

export function isUserCatalogPoi(item: AutocompleteResult): boolean {
  return item.source === 'poi' && (item.catalogSource ?? '').toUpperCase() === 'USER';
}

/**
 * Catalogue utilisateur (chez Mama X, pins nommés) au-dessus de Mapbox/OSM.
 * Communes / quartiers restent ensuite ; les POI OSM seedés puis le géocode distant.
 */
export function rankAutocompleteResults(results: AutocompleteResult[]): AutocompleteResult[] {
  const userPois = results.filter((r) => isUserCatalogPoi(r));
  const communes = results.filter((r) => r.source === 'commune');
  const catalogPois = results.filter((r) => r.source === 'poi' && !isUserCatalogPoi(r));
  const remote = results.filter((r) => r.source !== 'commune' && r.source !== 'poi');
  return [...userPois, ...communes, ...catalogPois.slice(0, 8), ...remote.slice(0, 10)].slice(0, 16);
}
