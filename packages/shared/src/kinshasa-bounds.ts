import { KINSHASA_COMMUNES } from './communes-seed';

const PADDING = 0.02;

function boundsFromCommunes() {
  const lats = KINSHASA_COMMUNES.map((c) => c.lat);
  const lngs = KINSHASA_COMMUNES.map((c) => c.lng);
  return {
    minLat: Math.min(...lats) - PADDING,
    maxLat: Math.max(...lats) + PADDING,
    minLng: Math.min(...lngs) - PADDING,
    maxLng: Math.max(...lngs) + PADDING,
  };
}

/** Bounding box couvrant toutes les communes seed Kinshasa (+ marge). */
export const KINSHASA_BOUNDS = boundsFromCommunes();

export function isKinshasaCoords(lat: number, lng: number): boolean {
  return (
    lat >= KINSHASA_BOUNDS.minLat &&
    lat <= KINSHASA_BOUNDS.maxLat &&
    lng >= KINSHASA_BOUNDS.minLng &&
    lng <= KINSHASA_BOUNDS.maxLng
  );
}
