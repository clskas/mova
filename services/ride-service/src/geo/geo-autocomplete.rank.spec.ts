import { rankAutocompleteResults, type AutocompleteResult } from './geo-autocomplete.rank';

function item(
  partial: Pick<AutocompleteResult, 'source' | 'label'> & Partial<AutocompleteResult>,
): AutocompleteResult {
  return {
    address: partial.label,
    lat: -4.32,
    lng: 15.31,
    commune: null,
    city: 'Kinshasa',
    ...partial,
  };
}

describe('rankAutocompleteResults', () => {
  it('classe un POI utilisateur au-dessus de Mapbox pour le même nom', () => {
    const ranked = rankAutocompleteResults([
      item({ source: 'mapbox', label: 'Chez Mama X, Gombe, Kinshasa' }),
      item({
        source: 'poi',
        label: 'Chez Mama X, Kinshasa',
        catalogSource: 'USER',
        poiId: 'u1',
      }),
      item({ source: 'photon', label: 'Mama, Kinshasa' }),
    ]);

    expect(ranked[0]).toMatchObject({ source: 'poi', catalogSource: 'USER', poiId: 'u1' });
    expect(ranked.map((r) => r.source)).toEqual(['poi', 'mapbox', 'photon']);
  });

  it('garde Mapbox/OSM pour une catégorie hôpital (pas seulement le catalogue USER)', () => {
    const ranked = rankAutocompleteResults([
      item({
        source: 'mapbox',
        label: 'Hôpital Général de Kinshasa',
        category: 'HOSPITAL',
      }),
      item({
        source: 'photon',
        label: 'Clinique Ngaliema',
        category: 'HOSPITAL',
      }),
      item({
        source: 'poi',
        label: 'Chez Mama X, Kinshasa',
        catalogSource: 'USER',
        category: 'OTHER',
      }),
    ]);

    expect(ranked.some((r) => r.source === 'mapbox' && r.category === 'HOSPITAL')).toBe(true);
    expect(ranked.some((r) => r.source === 'photon' && r.category === 'HOSPITAL')).toBe(true);
  });
});
