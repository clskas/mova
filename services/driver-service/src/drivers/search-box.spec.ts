import { searchBox } from './drivers.service';

const km = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

describe('searchBox (driver search by zone)', () => {
  it('contains the whole search circle (Kinshasa, Lubumbashi, Bunia)', () => {
    for (const [lat, lng] of [[-4.32, 15.31], [-11.66, 27.48], [1.56, 30.25]]) {
      const b = searchBox(lat, lng, 5);
      // points 5 km away in the 4 directions are inside the square
      expect(km(lat, lng, b.maxLat, lng)).toBeGreaterThanOrEqual(5);
      expect(km(lat, lng, b.minLat, lng)).toBeGreaterThanOrEqual(5);
      expect(km(lat, lng, lat, b.maxLng)).toBeGreaterThanOrEqual(5);
      expect(km(lat, lng, lat, b.minLng)).toBeGreaterThanOrEqual(5);
    }
  });

  it('leaves out a driver in another city', () => {
    const b = searchBox(-4.32, 15.31, 15); // Kinshasa
    const lubumbashi = { lat: -11.66, lng: 27.48 };
    expect(lubumbashi.lat >= b.minLat && lubumbashi.lat <= b.maxLat).toBe(false);
  });
});
