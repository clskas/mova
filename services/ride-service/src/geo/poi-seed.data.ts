import { PlaceOfInterestCategory } from '@prisma/client';
import { getActiveServiceAreas } from '@mova/shared';

export type PoiSeedRow = {
  osmId: string;
  name: string;
  category: PlaceOfInterestCategory;
  lat: number;
  lng: number;
  city: string;
  address?: string;
};

/** POI Kinshasa — import OSM ciblé (marchés, hôpitaux, universités, pharmacies). */
export const KINSHASA_POI_SEED: PoiSeedRow[] = [
  { osmId: 'osm-kin-market-central', name: 'Marché Central', category: 'MARKET', lat: -4.3217, lng: 15.3122, city: 'Kinshasa', address: 'Avenue du Commerce, Gombe' },
  { osmId: 'osm-kin-market-ndjili', name: 'Marché Ndjili', category: 'MARKET', lat: -4.4089, lng: 15.3914, city: 'Kinshasa' },
  { osmId: 'osm-kin-market-matete', name: 'Marché Matete', category: 'MARKET', lat: -4.3845, lng: 15.3521, city: 'Kinshasa' },
  { osmId: 'osm-kin-market-limete', name: 'Marché Limete', category: 'MARKET', lat: -4.3389, lng: 15.3345, city: 'Kinshasa' },
  { osmId: 'osm-kin-market-kintambo', name: 'Marché Kintambo', category: 'MARKET', lat: -4.3156, lng: 15.2789, city: 'Kinshasa' },
  { osmId: 'osm-kin-hosp-gombe', name: 'Cliniques Universitaires de Kinshasa', category: 'HOSPITAL', lat: -4.3389, lng: 15.2711, city: 'Kinshasa', address: 'Lemba' },
  { osmId: 'osm-kin-hosp-kinshasa', name: 'Hôpital Général de Kinshasa', category: 'HOSPITAL', lat: -4.3278, lng: 15.3089, city: 'Kinshasa', address: 'Gombe' },
  { osmId: 'osm-kin-hosp-mama-yemo', name: 'Hôpital Mama Yemo', category: 'HOSPITAL', lat: -4.3567, lng: 15.2912, city: 'Kinshasa', address: 'Barumbu' },
  { osmId: 'osm-kin-hosp-sendwe', name: 'Hôpital Sendwe', category: 'HOSPITAL', lat: -4.3712, lng: 15.3156, city: 'Kinshasa', address: 'Kalamu' },
  { osmId: 'osm-kin-uni-kin', name: 'Université de Kinshasa (UNIKIN)', category: 'UNIVERSITY', lat: -4.3389, lng: 15.2711, city: 'Kinshasa', address: 'Lemba' },
  { osmId: 'osm-kin-uni-upn', name: 'Université Pédagogique Nationale (UPN)', category: 'UNIVERSITY', lat: -4.3845, lng: 15.2567, city: 'Kinshasa', address: 'Mont-Ngafula' },
  { osmId: 'osm-kin-uni-ukb', name: 'Université Kongo (UKB)', category: 'UNIVERSITY', lat: -4.3012, lng: 15.2845, city: 'Kinshasa', address: 'Kintambo' },
  { osmId: 'osm-kin-pharm-gombe', name: 'Pharmacie du Centre (Gombe)', category: 'PHARMACY', lat: -4.3045, lng: 15.3012, city: 'Kinshasa' },
  { osmId: 'osm-kin-pharm-lemba', name: 'Pharmacie Lemba', category: 'PHARMACY', lat: -4.3456, lng: 15.2689, city: 'Kinshasa' },
  { osmId: 'osm-kin-pharm-ngaliema', name: 'Pharmacie Ngaliema', category: 'PHARMACY', lat: -4.3789, lng: 15.2456, city: 'Kinshasa' },
  { osmId: 'osm-kin-school-lycee', name: 'Lycée Bosangani', category: 'SCHOOL', lat: -4.3123, lng: 15.2934, city: 'Kinshasa' },
  { osmId: 'osm-kin-gov-gouvernorat', name: 'Gouvernorat de Kinshasa', category: 'GOVERNMENT', lat: -4.3045, lng: 15.3045, city: 'Kinshasa', address: 'Gombe' },
  { osmId: 'osm-kin-trans-gare', name: 'Gare Centrale', category: 'TRANSPORT', lat: -4.3189, lng: 15.3156, city: 'Kinshasa' },
];

/** Mapping tags Overpass → catégorie MOVA. */
export const OSM_TAG_TO_CATEGORY: Record<string, PlaceOfInterestCategory> = {
  marketplace: 'MARKET',
  hospital: 'HOSPITAL',
  clinic: 'HOSPITAL',
  university: 'UNIVERSITY',
  college: 'UNIVERSITY',
  pharmacy: 'PHARMACY',
  school: 'SCHOOL',
  government: 'GOVERNMENT',
  bus_station: 'TRANSPORT',
  train_station: 'TRANSPORT',
};

/** POI de base pour chaque ville MOVA (31 villes hors Kinshasa détaillée). */
export function buildRegionalPoiSeed(): PoiSeedRow[] {
  const rows: PoiSeedRow[] = [...KINSHASA_POI_SEED];
  const seenOsm = new Set(rows.map((r) => r.osmId));

  for (const area of getActiveServiceAreas()) {
    if (area.id === 'kinshasa') continue;
    const slug = area.id.replace(/-/g, '');
    const templates: Array<Omit<PoiSeedRow, 'city' | 'osmId'> & { suffix: string }> = [
      {
        suffix: 'market',
        name: `Marché ${area.name}`,
        category: 'MARKET',
        lat: area.centerLat + 0.004,
        lng: area.centerLng + 0.003,
        address: `Centre-ville, ${area.name}`,
      },
      {
        suffix: 'hospital',
        name: `Hôpital Général ${area.name}`,
        category: 'HOSPITAL',
        lat: area.centerLat - 0.003,
        lng: area.centerLng + 0.002,
        address: `${area.name}, ${area.province}`,
      },
      {
        suffix: 'university',
        name: `Université de ${area.name}`,
        category: 'UNIVERSITY',
        lat: area.centerLat + 0.002,
        lng: area.centerLng - 0.004,
        address: `${area.name}, ${area.province}`,
      },
      {
        suffix: 'pharmacy',
        name: `Pharmacie Centre ${area.name}`,
        category: 'PHARMACY',
        lat: area.centerLat,
        lng: area.centerLng,
        address: `Centre-ville, ${area.name}`,
      },
    ];

    for (const tpl of templates) {
      const osmId = `mova-${slug}-${tpl.suffix}`;
      if (seenOsm.has(osmId)) continue;
      seenOsm.add(osmId);
      rows.push({
        osmId,
        name: tpl.name,
        category: tpl.category,
        lat: tpl.lat,
        lng: tpl.lng,
        city: area.name,
        address: tpl.address,
      });
    }
  }

  return rows;
}

export const ALL_POI_SEED = buildRegionalPoiSeed();
