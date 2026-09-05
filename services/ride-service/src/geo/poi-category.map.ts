/** Aligné sur l'enum Prisma `PlaceOfInterestCategory` (sans importer le client généré). */
export type PoiCategory =
  | 'MARKET'
  | 'HOSPITAL'
  | 'UNIVERSITY'
  | 'PHARMACY'
  | 'SCHOOL'
  | 'GOVERNMENT'
  | 'TRANSPORT'
  | 'OTHER';

export type PoiCategorySpec = {
  /** Canonical Mapbox Search Box category IDs. */
  mapboxIds: string[];
  /** Photon `osm_tag` filters. */
  photonTags: string[];
  /** Requêtes FR de repli (Search Box /forward + Photon `q`). */
  queries: string[];
};

const SPECS: Record<PoiCategory, PoiCategorySpec> = {
  MARKET: {
    mapboxIds: ['shopping', 'grocery', 'supermarket'],
    photonTags: ['amenity:marketplace', 'shop:supermarket', 'shop:mall'],
    queries: ['marché', 'marché central'],
  },
  HOSPITAL: {
    mapboxIds: ['hospital'],
    photonTags: ['amenity:hospital', 'amenity:clinic'],
    queries: ['hôpital', 'clinique'],
  },
  UNIVERSITY: {
    mapboxIds: ['university'],
    photonTags: ['amenity:university', 'amenity:college'],
    queries: ['université'],
  },
  PHARMACY: {
    mapboxIds: ['pharmacy'],
    photonTags: ['amenity:pharmacy'],
    queries: ['pharmacie'],
  },
  SCHOOL: {
    mapboxIds: ['school'],
    photonTags: ['amenity:school'],
    queries: ['école', 'lycée'],
  },
  GOVERNMENT: {
    mapboxIds: ['government'],
    photonTags: ['office:government', 'amenity:townhall'],
    queries: ['gouvernorat', 'mairie'],
  },
  TRANSPORT: {
    mapboxIds: ['bus_station', 'parking'],
    photonTags: ['amenity:bus_station', 'railway:station'],
    queries: ['gare', 'gare routière'],
  },
  OTHER: {
    mapboxIds: [],
    photonTags: [],
    queries: [],
  },
};

/** Catégories affichées par les puces Taxi/Moto (Tous = ces quatre). */
export const TAXI_POI_CHIP_CATEGORIES: PoiCategory[] = [
  'MARKET',
  'HOSPITAL',
  'UNIVERSITY',
  'PHARMACY',
];

const MAPBOX_ID_TO_CATEGORY: Record<string, PoiCategory> = {
  shopping: 'MARKET',
  grocery: 'MARKET',
  supermarket: 'MARKET',
  market: 'MARKET',
  hospital: 'HOSPITAL',
  clinic: 'HOSPITAL',
  university: 'UNIVERSITY',
  college: 'UNIVERSITY',
  pharmacy: 'PHARMACY',
  school: 'SCHOOL',
  government: 'GOVERNMENT',
  townhall: 'GOVERNMENT',
  bus_station: 'TRANSPORT',
  parking: 'TRANSPORT',
  train_station: 'TRANSPORT',
};

export function isPlaceOfInterestCategory(value: string): value is PoiCategory {
  return Object.prototype.hasOwnProperty.call(SPECS, value);
}

export function parsePoiCategory(value?: string): PoiCategory | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  return isPlaceOfInterestCategory(upper) ? upper : undefined;
}

export function poiCategorySpec(category: PoiCategory): PoiCategorySpec {
  return SPECS[category];
}

export function inferPoiCategoryFromMapbox(
  ids?: string[] | null,
  labels?: string[] | null,
): PoiCategory | undefined {
  for (const id of ids ?? []) {
    const mapped = MAPBOX_ID_TO_CATEGORY[id.toLowerCase()];
    if (mapped) return mapped;
  }
  for (const label of labels ?? []) {
    const mapped = MAPBOX_ID_TO_CATEGORY[label.toLowerCase().replace(/\s+/g, '_')];
    if (mapped) return mapped;
  }
  return undefined;
}
