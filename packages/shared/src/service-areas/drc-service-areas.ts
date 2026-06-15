import { KINSHASA_COMMUNES } from '../communes-seed';

export interface ServiceAreaBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ServiceAreaDistrict {
  name: string;
  lat: number;
  lng: number;
}

export interface ServiceArea {
  id: string;
  name: string;
  province: string;
  centerLat: number;
  centerLng: number;
  bounds: ServiceAreaBounds;
  active: boolean;
  districts?: ServiceAreaDistrict[];
}

const PADDING = 0.02;

function boundsFromCenter(centerLat: number, centerLng: number, radiusDeg = 0.12): ServiceAreaBounds {
  return {
    minLat: centerLat - radiusDeg,
    maxLat: centerLat + radiusDeg,
    minLng: centerLng - radiusDeg,
    maxLng: centerLng + radiusDeg,
  };
}

function kinshasaBounds(): ServiceAreaBounds {
  const lats = KINSHASA_COMMUNES.map((c) => c.lat);
  const lngs = KINSHASA_COMMUNES.map((c) => c.lng);
  return {
    minLat: Math.min(...lats) - PADDING,
    maxLat: Math.max(...lats) + PADDING,
    minLng: Math.min(...lngs) - PADDING,
    maxLng: Math.max(...lngs) + PADDING,
  };
}

function area(
  id: string,
  name: string,
  province: string,
  centerLat: number,
  centerLng: number,
  radiusDeg = 0.12,
  districts?: ServiceAreaDistrict[],
): ServiceArea {
  return {
    id,
    name,
    province,
    centerLat,
    centerLng,
    bounds: id === 'kinshasa' ? kinshasaBounds() : boundsFromCenter(centerLat, centerLng, radiusDeg),
    active: true,
    districts,
  };
}

/** Zones de service MOVA — capitales provinciales + grandes villes RDC. */
export const DRC_SERVICE_AREAS: ServiceArea[] = [
  area('kinshasa', 'Kinshasa', 'Kinshasa', -4.3217, 15.3125, 0.35, KINSHASA_COMMUNES),
  area('lubumbashi', 'Lubumbashi', 'Haut-Katanga', -11.6647, 27.4794, 0.15, [
    { name: 'Centre-ville', lat: -11.6647, lng: 27.4794 },
    { name: 'Kenya', lat: -11.678, lng: 27.462 },
    { name: 'Kamalondo', lat: -11.652, lng: 27.498 },
  ]),
  area('goma', 'Goma', 'Nord-Kivu', -1.6788, 29.2175, 0.1, [
    { name: 'Centre', lat: -1.6788, lng: 29.2175 },
    { name: 'Himbi', lat: -1.692, lng: 29.205 },
  ]),
  area('bukavu', 'Bukavu', 'Sud-Kivu', -2.4908, 28.8428, 0.1),
  area('kisangani', 'Kisangani', 'Tshopo', 0.5153, 25.191, 0.12),
  area('mbuji-mayi', 'Mbuji-Mayi', 'Kasaï-Oriental', -6.136, 23.5898, 0.12),
  area('kananga', 'Kananga', 'Kasaï-Central', -5.8962, 22.4167, 0.12),
  area('matadi', 'Matadi', 'Kongo Central', -5.8167, 13.45, 0.1),
  area('boma', 'Boma', 'Kongo Central', -5.85, 13.05, 0.08),
  area('kolwezi', 'Kolwezi', 'Lualaba', -10.7167, 25.4667, 0.1),
  area('likasi', 'Likasi', 'Haut-Katanga', -10.9833, 26.7333, 0.1),
  area('tshikapa', 'Tshikapa', 'Kasaï', -6.4167, 20.8, 0.1),
  area('mbandaka', 'Mbandaka', 'Équateur', 0.0478, 18.2603, 0.1),
  area('kindu', 'Kindu', 'Maniema', -2.95, 25.95, 0.1),
  area('bunia', 'Bunia', 'Ituri', 1.5594, 30.2528, 0.1),
  area('butembo', 'Butembo', 'Nord-Kivu', 0.141, 29.291, 0.08),
  area('beni', 'Beni', 'Nord-Kivu', 0.491, 29.473, 0.08),
  area('uvira', 'Uvira', 'Sud-Kivu', -3.4, 29.1333, 0.08),
  area('kalemie', 'Kalemie', 'Tanganyika', -5.93, 29.1928, 0.1),
  area('kamina', 'Kamina', 'Haut-Lomami', -8.7333, 25.0, 0.1),
  area('gbadolite', 'Gbadolite', 'Nord-Ubangi', 4.2833, 21.0167, 0.08),
  area('gemena', 'Gemena', 'Sud-Ubangi', 3.2517, 19.7725, 0.08),
  area('boende', 'Boende', 'Tshuapa', -0.2167, 20.8833, 0.08),
  area('lisala', 'Lisala', 'Mongala', 2.15, 21.5167, 0.08),
  area('isiro', 'Isiro', 'Haut-Uele', 2.7833, 27.6167, 0.08),
  area('buta', 'Buta', 'Bas-Uele', 2.8167, 24.7333, 0.08),
  area('inongo', 'Inongo', 'Mai-Ndombe', -1.95, 18.2833, 0.08),
  area('bandundu', 'Bandundu', 'Kwilu', -3.3167, 17.3667, 0.08),
  area('kikwit', 'Kikwit', 'Kwilu', -5.04, 18.8167, 0.1),
  area('kenge', 'Kenge', 'Kwango', -4.8167, 17.0333, 0.08),
  area('kabinda', 'Kabinda', 'Lomami', -6.1375, 24.4278, 0.08),
  area('lusambo', 'Lusambo', 'Sankuru', -4.975, 23.4436, 0.08),
];

/** Centre carte RDC — utilisé uniquement comme fallback technique (pas de ville privilégiée). */
export const RDC_MAP_CENTER = { lat: -2.88, lng: 23.66 };

/** @deprecated Utiliser findNearestServiceArea — conservé pour compatibilité imports. */
export const DEFAULT_SERVICE_AREA_ID = 'kinshasa';

export const KINSHASA_BOUNDS = kinshasaBounds();
