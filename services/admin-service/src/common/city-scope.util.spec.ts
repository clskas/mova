import {
  assertCoordsInManagedCity,
  filterRowsByManagedCity,
  resolveManagedCityScope,
} from './city-scope.util';
import { UserRole } from '@mova/shared';

describe('city-scope.util', () => {
  it('CITY_ADMIN requires managedCity', () => {
    expect(() => resolveManagedCityScope({ role: UserRole.CITY_ADMIN })).toThrow(/ville gérée/);
    expect(resolveManagedCityScope({ role: UserRole.CITY_ADMIN, managedCity: 'Beni' })).toBe('Beni');
    expect(resolveManagedCityScope({ role: UserRole.ADMIN, managedCity: 'Beni' })).toBeNull();
  });

  it('filters rows by pickup GPS city', () => {
    const rows = [
      { id: 'kin', pickupLat: -4.325, pickupLng: 15.322 }, // Kinshasa approx
      { id: 'beni', pickupLat: 0.491, pickupLng: 29.465 }, // Beni approx
      { id: 'junk', pickupLat: 0, pickupLng: 0 }, // hors zone — ne doit pas fuiter
    ];
    const beni = filterRowsByManagedCity(rows, 'Beni', (r) => ({
      lat: r.pickupLat,
      lng: r.pickupLng,
    }));
    expect(beni.map((r) => r.id)).toEqual(['beni']);
  });

  it('excludes coordinates outside all service-area bounds', () => {
    const rows = [{ id: 'ocean', lat: 0, lng: 0 }];
    expect(filterRowsByManagedCity(rows, 'Beni', (r) => r)).toEqual([]);
    expect(filterRowsByManagedCity(rows, 'Kinshasa', (r) => r)).toEqual([]);
  });

  it('assertCoordsInManagedCity blocks other cities', () => {
    expect(() => assertCoordsInManagedCity('Beni', -4.325, 15.322)).toThrow(/hors/);
    expect(() => assertCoordsInManagedCity('Beni', 0.491, 29.465)).not.toThrow();
    expect(() => assertCoordsInManagedCity(null, -4.325, 15.322)).not.toThrow();
  });
});
